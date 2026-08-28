'use strict';

/**
 * VS-AI — Secure API proxy server (Node.js / Express)
 *
 * Replaces the original PHP stack with an equivalent Node.js implementation
 * while preserving every security layer.
 */

const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// ── Load version info ─────────────────────────────────────────────────
let versionInfo = { version: '0.0.0', buildDate: new Date().toISOString(), commit: 'unknown' };
try {
    const versionPath = path.join(__dirname, 'version.json');
    const versionContent = fs.readFileSync(versionPath, 'utf8');
    console.log('[DEBUG] version.json raw:', versionContent);
    const parsed = JSON.parse(versionContent);
    versionInfo = {
        version: parsed.version || '0.0.0',
        buildDate: parsed.buildDate || new Date().toISOString(),
        commit: parsed.commit || 'unknown',
    };
    console.log('[INFO] Loaded version:', versionInfo.version);
    // Override commit with git hash if available
    try {
        const gitHash = require('child_process')
            .execSync('git rev-parse --short HEAD', { cwd: __dirname, encoding: 'utf8' })
            .trim();
        versionInfo.commit = gitHash;
    } catch { /* ignore */ }
} catch (e) {
    console.warn('[WARN] Could not load version.json:', e.message);
}

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
        maxAge:   24 * 60 * 60 * 1000,
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
    const windowMs = 60_000;

    let entries = rateLimitStore.get(ip) || [];
    entries = entries.filter(ts => (now - ts) < windowMs);

    if (entries.length >= config.rate_limit) {
        rateLimitStore.set(ip, entries);
        return false;
    }

    entries.push(now);
    rateLimitStore.set(ip, entries);
    return true;
}

// ── Request logging middleware ──────────────────────────────────────
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
});

// ─── Routes ──────────────────────────────────────────────────────────

// Health check endpoint
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: versionInfo.version,
        config: {
            api_base: config.api_base,
            api_path: config.api_path,
            model: config.model,
            has_api_key: config.api_key !== 'YOUR_API_KEY_HERE',
            rate_limit: config.rate_limit,
            check_referer: config.check_referer,
        },
    });
});

// Version endpoint
app.get('/api/version', (_req, res) => {
    res.json(versionInfo);
});

// Root → index.html (redirect page)
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// /chat → serve chat.html with CSRF token and version injected
app.get('/chat', (req, res) => {
    if (!req.session['csrf-token']) {
        req.session['csrf-token'] = crypto.randomBytes(32).toString('hex');
    }

    const htmlPath = path.join(__dirname, 'chat.html');
    fs.readFile(htmlPath, 'utf8', (err, html) => {
        if (err) {
            console.error('[ERROR] Failed to read chat.html:', err);
            res.status(500).send('Error loading chat page');
            return;
        }
        const token = req.session['csrf-token'];
        html = html.replace('__CSRF_TOKEN__', token);
        html = html.replace('__APP_VERSION__', 'v' + versionInfo.version);
        html = html.replace('__BUILD_DATE__', versionInfo.buildDate);
        html = html.replace('__GIT_COMMIT__', versionInfo.commit);

        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        });
        res.send(html);
    });
});

// ── API proxy endpoint ──────────────────────────────────────────────
app.options('/api/chat', (_req, res) => {
    res.status(403).end();
});

app.post('/api/chat', async (req, res) => {
    const requestId = crypto.randomBytes(4).toString('hex');
    const log = (msg) => console.log(`[${requestId}] ${msg}`);
    const logError = (msg) => console.error(`[${requestId}] ${msg}`);

    try {
        // ── 1. Referer / Origin validation ────────────────────────────
        if (config.check_referer) {
            const origin  = req.headers.origin || '';
            const referer = req.headers.referer || '';
            const host    = req.headers.host   || '';

            let valid = false;

            if (config.allowed_origins.length > 0) {
                valid = config.allowed_origins.some(a => origin === a || referer.startsWith(a));
            }

            if (!valid && host) {
                const prefixes = ['http://' + host, 'https://' + host];
                valid = prefixes.some(p => referer.startsWith(p));
            }

            if (!valid) {
                log(`Forbidden: invalid origin (origin=${origin}, referer=${referer}, host=${host})`);
                res.status(403);
                res.set('Content-Type', 'text/event-stream; charset=utf-8');
                res.write('data: {"error":"Forbidden: invalid origin"}\n\n');
                res.write('data: [DONE]\n\n');
                return res.end();
            }
        }

        // ── 2. CSRF token validation ──────────────────────────────────
        const csrf = req.headers['x-csrf-token'] || '';
        const sessionCsrf = req.session['csrf-token'] || '';
        if (!csrf || !sessionCsrf || !crypto.timingSafeEqual(
            Buffer.from(csrf, 'utf8'),
            Buffer.from(sessionCsrf, 'utf8')
        )) {
            log('Forbidden: invalid CSRF token');
            res.status(403);
            res.set('Content-Type', 'text/event-stream; charset=utf-8');
            res.write('data: {"error":"Forbidden: invalid CSRF token"}\n\n');
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        // ── 3. Rate limiting ──────────────────────────────────────────
        const ip = req.ip || req.connection.remoteAddress || '0.0.0.0';
        if (!checkRateLimit(ip)) {
            log(`Rate limit exceeded for IP: ${ip}`);
            res.status(429);
            res.set('Content-Type', 'text/event-stream; charset=utf-8');
            res.set('Retry-After', '60');
            res.write('data: {"error":"Rate limit exceeded. Try again later."}\n\n');
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        // ── 4. Read & validate request body ──────────────────────────
        const json = req.body;
        if (!json || !Array.isArray(json.messages) || json.messages.length === 0) {
            log('Bad request: messages array required');
            res.status(400);
            res.set('Content-Type', 'text/event-stream; charset=utf-8');
            res.write('data: {"error":"Invalid request: messages array required"}\n\n');
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        // ── 5. Force model + streaming ────────────────────────────────
        json.model = config.model || 'deepseek-ai/DeepSeek-R1';
        json.stream = true;

        // ── 6. Inject identity system message ────────────────────────
        const identitySystem = {
            role: 'system',
            content: 'Your name is VS (short for Vision). When anyone asks "what is your name?", "what model are you?", "who are you?", or similar, you MUST reply that your name is VS (Vision). Keep answers clear and confident. Do not say you are OpenAI, DeepSeek, or any other model name.',
        };
        json.messages.unshift(identitySystem);

        const forwardBody = JSON.stringify(json, null, 0);
        log(`Forwarding request: model=${json.model}, messages=${json.messages.length}`);

        // ── 7. Check API key ─────────────────────────────────────────
        if (!config.api_key || config.api_key === 'YOUR_API_KEY_HERE') {
            logError('API key not configured');
            res.status(500);
            res.set('Content-Type', 'text/event-stream; charset=utf-8');
            res.write('data: {"error":"Server configuration error: API key not set"}\n\n');
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        // ── 8. Forward to upstream API (SSE streaming) ───────────────
        const upstream = `${config.api_base.replace(/\/+$/, '')}${config.api_path}`;
        log(`Calling upstream: ${upstream}`);

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

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 min timeout

        try {
            const response = await fetch(upstream, {
                method: 'POST',
                headers: {
                    'Content-Type':   'application/json',
                    'Accept':         'text/event-stream',
                    'Authorization':  `Bearer ${config.api_key}`,
                },
                body: forwardBody,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const err = await response.text().catch(() => 'Unknown upstream error');
                logError(`Upstream error: ${response.status} ${err}`);
                res.write(`data: {"error":"Upstream error: ${response.status} ${err}"}\n\n`);
                res.write('data: [DONE]\n\n');
                return res.end();
            }

            log('Upstream connected, streaming response...');

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
            log('Stream completed');

        } catch (fetchErr) {
            clearTimeout(timeoutId);
            if (fetchErr.name === 'AbortError') {
                logError('Upstream request timed out');
                res.write('data: {"error":"Upstream request timed out"}\n\n');
            } else {
                logError(`Fetch error: ${fetchErr.message}`);
                res.write(`data: {"error":"Upstream connection failed: ${fetchErr.message}"}\n\n`);
            }
            res.write('data: [DONE]\n\n');
            res.end();

        }

    } catch (err) {
        logError(`Unexpected error: ${err.stack || err.message || err}`);
        if (!res.headersSent) {
            res.status(500);
            res.set('Content-Type', 'text/event-stream; charset=utf-8');
            res.write(`data: {"error":"Internal server error: ${err.message || err}"}\n\n`);
            res.write('data: [DONE]\n\n');
        }
        res.end();
    }
});

// ── Static file serving ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));

// ── 404 handler ──────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).send('Not Found');
});

// ── Global error handler ────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    console.error('[UNCAUGHT]', err);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ── Start server ─────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✅ VS-AI server running on port ${PORT}`);
    console.log(`   API:    ${config.api_base}${config.api_path}`);
    console.log(`   Model:  ${config.model}`);
    console.log(`   Rate limit: ${config.rate_limit} req/60s per IP`);
    console.log(`   Health: GET /health`);
    console.log(`   API key configured: ${config.api_key !== 'YOUR_API_KEY_HERE' ? 'YES' : 'NO (using default!)'}`);
});