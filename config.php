<?php
/**
 * API Configuration — keep this file outside web root in production,
 * or ensure it is protected via .htaccess.
 *
 * ⚠️  SECURITY: Do NOT commit this file to version control.
 */

return [
    // ── API Endpoint ──────────────────────────────────────────────
    // Base URL of the OpenAI-compatible router.
    'api_base'   => 'https://9router-production-aa27.up.railway.app/v1',

    // The /chat/completions path is appended automatically.
    'api_path'   => '/chat/completions',

    // Your secret API key — replace with your real key.
    'api_key'    => 'sk-8e6374a63276fa01-mvtgy3-b92a1c10',

    // Model identifier sent to the upstream API.
    'model'      => 'OpenCode',

    // ── Security ──────────────────────────────────────────────────
    // Allowed origins (empty = check Referer header instead).
    // Set to ['https://yourdomain.com'] for strict origin matching.
    'allowed_origins' => [],

    // Enable Referer / Origin validation (recommended: true).
    'check_referer' => true,

    // Rate limit: max requests per IP per 60-second window (0 = disabled).
    'rate_limit' => 30,

    // Require a valid session cookie (session_start must be called first).
    'require_session' => true,
];
