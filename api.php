<?php
/**
 * Secure API proxy — streams chat completions to the upstream router.
 *
 * SECURITY LAYERS
 * ───────────────
 * 1. Referer / Origin validation — blocks direct / external calls.
 * 2. CSRF token check via custom header (X-CSRF-TOKEN).
 * 3. Per-IP rate limiting (file-based, lock-protected).
 * 4. API key is injected server-side — never exposed to the browser.
 * 5. Request body is validated & sanitised before forwarding.
 * 6. Upstream URL never reaches the client.
 */

session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// ── Load configuration ───────────────────────────────────────────
$config = require __DIR__ . '/config.php';

// ── CORS hardening — reject preflight & lock down headers ────────
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(403);
    exit;
}

// Disable PHP output buffering to ensure real-time SSE streaming
if (function_exists('ini_set')) {
    @ini_set('output_buffering', '0');
    @ini_set('zlib.output_compression', '0');
    @ini_set('implicit_flush', '1');
}
while (ob_get_level() > 0) {
    ob_end_flush();
}

header('Access-Control-Allow-Origin: ' . ($_SERVER['HTTP_ORIGIN'] ?? ''));
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-TOKEN');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: text/event-stream; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('X-Accel-Buffering: no');
header('Pragma: no-cache');
header('Expires: 0');
// Prevent browsers from exposing the response to JavaScript
header('X-Content-Type-Options: nosniff');

// ── 1. Method gate ──────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo "data: {\"error\":\"Method not allowed\"}\n\n";
    echo "data: [DONE]\n\n";
    exit;
}

// ── 2. Referer / Origin validation ──────────────────────────────
if (!empty($config['check_referer'])) {
    $origin  = $_SERVER['HTTP_ORIGIN']  ?? '';
    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    $host    = $_SERVER['HTTP_HOST']    ?? '';

    $valid = false;

    // Check explicit allowed origins list first
    if (!empty($config['allowed_origins'])) {
        foreach ($config['allowed_origins'] as $allowed) {
            if ($origin === $allowed || strpos($referer, $allowed) === 0) {
                $valid = true;
                break;
            }
        }
    }

    // Fallback: same-origin check (Referer host must match our Host header)
    if (!$valid && $host) {
        foreach (['http://' . $host, 'https://' . $host] as $prefix) {
            if (strpos($referer, $prefix) === 0) {
                $valid = true;
                break;
            }
        }
    }

    if (!$valid) {
        http_response_code(403);
        echo "data: {\"error\":\"Forbidden: invalid origin\"}\n\n";
        echo "data: [DONE]\n\n";
        exit;
    }
}

// ── 3. CSRF token validation ────────────────────────────────────
$csrf = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
$sessionCsrf = $_SESSION['csrf-token'] ?? '';
if (empty($csrf) || empty($sessionCsrf) || !hash_equals($sessionCsrf, $csrf)) {
    http_response_code(403);
    echo "data: {\"error\":\"Forbidden: invalid CSRF token\"}\n\n";
    echo "data: [DONE]\n\n";
    exit;
}

// ── 4. Rate limiting (per-IP, 60-second window) ─────────────────
if (!empty($config['rate_limit'])) {
    $ip     = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    $window = 60;
    $limit  = (int) $config['rate_limit'];
    $dir    = sys_get_temp_dir() . '/api_ratelimit';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);

    $key     = $dir . '/' . md5($ip) . '.json';
    $now     = time();
    $records = [];

    if (file_exists($key)) {
        $raw = @file_get_contents($key);
        if ($raw) $records = json_decode($raw, true) ?: [];
    }

    // Prune old entries
    $records = array_filter($records, function ($t) use ($now, $window) {
        return ($now - $t) < $window;
    });

    if (count($records) >= $limit) {
        http_response_code(429);
        header('Retry-After: ' . $window);
        echo "data: {\"error\":\"Rate limit exceeded. Try again later.\"}\n\n";
        echo "data: [DONE]\n\n";
        exit;
    }

    $records[] = $now;
    file_put_contents($key, json_encode($records), LOCK_EX);
}

// ── 5. Read & validate request body ─────────────────────────────
$body = file_get_contents('php://input');
if (!$body) {
    http_response_code(400);
    echo "data: {\"error\":\"Empty request body\"}\n\n";
    echo "data: [DONE]\n\n";
    exit;
}

$json = json_decode($body, true);
if (!is_array($json) || empty($json['messages']) || !is_array($json['messages'])) {
    http_response_code(400);
    echo "data: {\"error\":\"Invalid request: messages array required\"}\n\n";
    echo "data: [DONE]\n\n";
    exit;
}

// Force our model — ignore whatever the client sends
$json['model'] = $config['model'] ?? 'deepseek-ai/DeepSeek-R1';

// Force streaming — the frontend expects SSE chunks with delta.content
$json['stream'] = true;

// Inject the model identity as a system instruction, so the model
// introduces itself as "VS" (vision) whenever asked its name.
$identitySystem = [
    'role'    => 'system',
    'content' => 'Your name is VS (short for Vision). When anyone asks "what is your name?", "what model are you?", "who are you?",
                  or similar, you MUST reply that your name is VS (Vision). Keep answers clear and confident.
                  Do not say you are OpenAI, DeepSeek, or any other model name.',
];

// Prepend the identity instruction to the conversation
array_unshift($json['messages'], $identitySystem);

// Optional: limit context size to control costs
// if (isset($json['max_tokens'])) $json['max_tokens'] = min((int)$json['max_tokens'], 4096);

$forwardBody = json_encode($json, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

// ── 6. Build upstream URL (key injected server-side) ────────────
$upstream = rtrim($config['api_base'], '/') . '/' . ltrim($config['api_path'], '/');

// ── 7. Forward request via cURL ─────────────────────────────────
$apiKey = $config['api_key'] ?? '';
if (empty($apiKey) || $apiKey === 'YOUR_API_KEY_HERE') {
    echo "data: {\"error\":\"Server configuration error: API key not set\"}\n\n";
    echo "data: [DONE]\n\n";
    exit;
}

$ch = curl_init($upstream);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $forwardBody,
    CURLOPT_RETURNTRANSFER => false,
    CURLOPT_HEADER         => false,
    CURLOPT_TIMEOUT        => 180,
    CURLOPT_CONNECTTIMEOUT => 30,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Accept: text/event-stream',
        'Authorization: Bearer ' . $apiKey,
    ],
    CURLOPT_WRITEFUNCTION  => function ($ch, $chunk) {
        echo $chunk;
        if (ob_get_level()) ob_flush();
        flush();
        return strlen($chunk);
    },
]);

curl_exec($ch);
$errno = curl_errno($ch);
$error = curl_error($ch);
curl_close($ch);

if ($errno) {
    echo "data: {\"error\":\"Upstream connection failed: " . addslashes($error) . "\"}\n\n";
    echo "data: [DONE]\n\n";
}
