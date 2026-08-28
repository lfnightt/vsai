'use strict';

/**
 * VS-AI — Secure API proxy server (Node.js / Express)
 *
 * Replaces the original PHP stack (index.php, chat.php, api.php, config.php)
 * with an equivalent Node.js implementation while preserving every security
 * layer:
 *
 *   1. Same-origin (Referer / Origin) validation
 *   2. CSRF token check (X-CSRF-TOKEN header vs. session-bound token)
 *   3. Per-IP rate limiting (in-memory, 60-second sliding window)
 *   4. Server-side API key injection (never exposed to the browser)
 *   5. Request body validation & sanitisation
 *   6. Hidden upstream URL + SSE response streaming
 *
 * Environment variables (set in Railway project settings):
 *   API_KEY         — secret API key (starts with sk-)
 *   API_BASE        — upstream router base URL
 *   MODEL           — model identifier
 *   ALLOWED_ORIGINS — comma-separated allowed origins (optional)
 *   CHECK_REFERER   — set to "false" to disable (optional, default: true)
 *   RATE_LIMIT      — requests per IP per 60s (optional, default: 30)
 *   SESSION_SECRET  — session signing secret (optional, auto-generated)
 */

const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// ── Configuration from environment ───────────────────────────────────
const config = {
    api_base:         process.env.API_BASE || 'https://9router-production-aa27.up.railway.app/v1',
    api_path:         '/chat/completions',
    api_key:          process.env.API_KEY || 'YOUR_API_KEY_HERE',
    model:            process.env.MODEL || 'OpenCode',
    allowed_origins:  process.env.ALLOWED_ORIGINS
                        ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
                        : [],
    check_referer:    process.env.CHECK_REFERER !== 'false',
    rate_limit:       parseInt(process.env.RATE_LIMIT ?? '30', 10),
    require_session: true,
};

// ── Session middleware ──────────────────────────────────────────────
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure:   process.env.NODE_ENV === 'production',
        maxAge:   24 * 60 * 60 * 1000, // 24 hours
    },
}));

// ── Body parsing ────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Global security headers ─────────────────────────────────────────
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

// ── Rate limiting (in-memory, sliding-window, per-IP) ───────────────
const rateLimitStore = new Map();

function checkRateLimit(ip) {
    if (!config.rate_limit || config.rate_limit === 0) return true;

    const now = Date.now();
    const windowMs = 60_000; // 60 seconds

    let entries = rateLimitStore.get(ip) || [];
    // Prune old entries
    entries = entries.filter(ts => (now - ts) < windowMs);

    if (entries.length >= config.rate_limit) {
        rateLimitStore.set(ip, entries);
        return false;
    }

    entries.push(now);
    rateLimitStore.set(ip, entries);
    return true;
}

// ─── Routes ──────────────────────────────────────────────────────────

// Root → index.html (redirect page)
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// /chat → serve chat.html with CSRF token injected
app.get('/chat', (req, res) => {
    if (!req.session['csrf-token']) {
        req.session['csrf-token'] = crypto.randomBytes(32).toString('hex');
    }

    const htmlPath = path.join(__dirname, 'chat.html');
    fs.readFile(htmlPath, 'utf8', (err, html) => {
        if (err) {
            res.status(500).send('Error loading chat page');
            return;
        }
        const token = req.session['csrf-token'];
        html = html.replace('__CSRF_TOKEN__', token);

        // Never cache the chat page
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        });
        res.send(html);
    });
});

// ── API proxy endpoint ──────────────────────────────────────────────
// Mirrors api.php: validates, rate-limits, then streams SSE to upstream

// Reject CORS preflight
app.options('/api/chat', (_req, res) => {
    res.status(403).end();
});

app.post('/api/chat', async (req, res) => {

    // ── 1. Referer / Origin validation ──────────────────────────────
    if (config.check_referer) {
        const origin  = req.headers.origin || '';
        const referer = req.headers.referer || '';
        const host    = req.headers.host   || '';

        let valid = false;

        // Check explicit allowed origins list
        if (config.allowed_origins.length > 0) {
            valid = config.allowed_origins.some(a => origin === a || referer.startsWith(a));
        }

        // Fallback: same-origin check (Referer host must match Host header)
        if (!valid && host) {
            const prefixes = ['http://' + host, 'https://' + host];
            valid = prefixes.some(p => referer.startsWith(p));
        }

        if (!valid) {
            res.status(403);
            res.set('Content-Type', 'text/event-stream; charset=utf-8');
            res.write('data: {"error":"Forbidden: invalid origin"}\n\n');
            res.write('data: [DONE]\n\n');
            return res.end();
        }
    }

    // ── 2. CSRF token validation ────────────────────────────────────
    const csrf = req.headers['x-csrf-token'] || '';
    const sessionCsrf = req.session['csrf-token'] || '';
    if (!csrf || !sessionCsrf || !crypto.timingSafeEqual(
        Buffer.from(csrf, 'utf8'),
        Buffer.from(sessionCsrf, 'utf8')
    )) {
        res.status(403);
        res.set('Content-Type', 'text/event-stream; charset=utf-8');
        res.write('data: {"error":"Forbidden: invalid CSRF token"}\n\n');
        res.write('data: [DONE]\n\n');
        return res.end();
    }

    // ── 3. Rate limiting ────────────────────────────────────────────
    const ip = req.ip || req.connection.remoteAddress || '0.0.0.0';
    if (!checkRateLimit(ip)) {
        res.status(429);
        res.set('Content-Type', 'text/event-stream; charset=utf-8');
        res.set('Retry-After', '60');
        res.write('data: {"error":"Rate limit exceeded. Try again later."}\n\n');
        res.write('data: [DONE]\n\n');
        return res.end();
    }

    // ── 4. Read & validate request body ────────────────────────────
    let json;
    try {
        json = req.body;
    } catch {
        res.status(400);
        res.set('Content-Type', 'text/event-stream; charset=utf-8');
        res.write('data: {"error":"Empty request body"}\n\n');
        res.write('data: [DONE]\n\n');
        return res.end();
    }

    if (!json || !Array.isArray(json.messages) || json.messages.length === 0) {
        res.status(400);
        res.set('Content-Type', 'text/event-stream; charset=utf-8');
        res.write('data: {"error":"Invalid request: messages array required"}\n\n');
        res.write('data: [DONE]\n\n');
        return res.end();
    }

    // ── 5. Force model + streaming (as PHP api.php did) ──────────────
    json.model = config.model || 'deepseek-ai/DeepSeek-R1';
    json.stream = true;

    // ── 6. Inject identity system message ──────────────────────────
    const identitySystem = {
        role: 'system',
        content: 'Your name is VS (short for Vision). When anyone asks "what is your name?", "what model are you?", "who are you?", or similar, you MUST reply that your name is VS (Vision). Keep answers clear and confident. Do not say you are OpenAI, DeepSeek, or any other model name.',
    };
    json.messages.unshift(identitySystem);

    const forwardBody = JSON.stringify(json, null, 0);

    // ── 7. Check API key ───────────────────────────────────────────
    if (!config.api_key || config.api_key === 'YOUR_API_KEY_HERE') {
        res.status(500);
        res.set('Content-Type', 'text/event-stream; charset=utf-8');
        res.write('data: {"error":"Server configuration error: API key not set"}\n\n');
        res.write('data: [DONE]\n\n');
        return res.end();
    }

    // ── 8. Forward to upstream API (SSE streaming) ───────────────────
    const upstream = `${config.api_base.replace(/\/+$/, '')}${config.api_path}`;

    res.set({
        'Content-Type':         'text/event-stream; charset=utf-8',
        'Cache-Control':        'no-cache, no-store, must-revalidate',
        'X-Accel-Buffering':    'no',
        'Pragma':               'no-cache',
        'Expires':              '0',
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin':  req.headers.origin || '',
        'Access-Control-Allow-Credentials': 'true',
    });

    try {
        const response = await fetch(upstream, {
            method: 'POST',
            headers: {
                'Content-Type':   'application/json',
                'Accept':         'text/event-stream',
                'Authorization':  `Bearer ${config.api_key}`,
            },
            body: forwardBody,
        });

        if (!response.ok) {
            const err = await response.text().catch(() => 'Unknown upstream error');
            res.write(`data: {"error":"Upstream error: ${response.status} ${err}"}\n\n`);
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        // Stream the upstream response back to the client
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            res.write(chunk);
        }

        res.write('data: [DONE]\n\n');
        res.end();

    } catch (err) {
        res.write(`data: {"error":"Upstream connection failed: ${err.message || err}"}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
    }
});

// ── Static file serving (CSS, JS, images) ───────────────────────────
// Must come after /api/chat route so API requests aren't intercepted
app.use(express.static(path.join(__dirname)));

// ── 404 handler ──────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).send('Not Found');
});

// ── Start server ─────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✅ VS-AI server running on port ${PORT}`);
    console.log(`   API:    ${config.api_base}${config.api_path}`);
    console.log(`   Model:  ${config.model}`);
    console.log(`   Rate limit: ${config.rate_limit} req/60s per IP`);
});
