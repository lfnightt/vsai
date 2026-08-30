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
    search_base:      process.env.NINEROUTER_URL || process.env.API_BASE || 'https://9router-production-aa27.up.railway.app/v1',
    search_key:       process.env.NINEROUTER_KEY || process.env.API_KEY || '',
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
            search_base: config.search_base,
            has_search_key: !!config.search_key,
            rate_limit: config.rate_limit,
            check_referer: config.check_referer,
        },
    });
});

// Version endpoint
app.get('/api/version', (_req, res) => {
    res.json(versionInfo);
});

// Updates endpoint
app.get('/api/updates', (_req, res) => {
    try {
        const updatesPath = path.join(__dirname, 'updates.json');
        const data = JSON.parse(fs.readFileSync(updatesPath, 'utf8'));
        res.json(data);
    } catch (e) {
        console.error('[ERROR] Could not load updates.json:', e.message);
        res.json([]);
    }
});

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
            console.error('[ERROR] Failed to read chat.html:', err);
            res.status(500).send('Error loading chat page');
            return;
        }
        const token = req.session['csrf-token'];
        html = html.replace('__CSRF_TOKEN__', token);

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


// ── Web Search endpoint (proxy to 9Router /v1/search) ────────────────
app.post('/api/search', async (req, res) => {
    try {
        const json = req.body;
        console.log('[SEARCH] request received:', JSON.stringify(json));
        if (!json || !json.query) {
            console.error('[SEARCH] bad request: no query field');
            return res.status(400).json({ error: 'Invalid request: query field required' });
        }

        const baseUrl = config.search_base.replace(/\/+$/, '');
        const searchUrl = baseUrl + '/search';
        console.log('[SEARCH] search URL:', searchUrl);

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
        if (config.search_key) {
            headers['Authorization'] = 'Bearer ' + config.search_key;
            console.log('[SEARCH] using auth key (from ' + (process.env.NINEROUTER_KEY ? 'NINEROUTER_KEY' : 'API_KEY fallback') + '):', config.search_key.substring(0, 8) + '...');
        } else {
            console.warn('[SEARCH] ⚠️ NO API KEY CONFIGURED — search will likely fail!');
            console.warn('[SEARCH] Set NINEROUTER_KEY or API_KEY environment variable');
        }

        // Known 9Router web search model names (tried as fallback if discovery fails)
        var knownSearchModels = [
            'tavily/search',
            'search-combo',
            'web-search',
            'brave/search',
            'duckduckgo/search',
            'exa/search',
            'perplexity/search',
            'searxng/search',
        ];

        // Helper: try a search with a specific model name
        async function trySearch(modelName) {
            const body = Object.assign({}, json, { model: modelName });
            console.log('[SEARCH] POST to:', searchUrl, '| model:', modelName, '| query:', json.query);
            const response = await fetch(searchUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(30000),
            });
            console.log('[SEARCH] upstream response:', response.status, response.statusText);
            return response;
        }

        // Helper: discover available search models from 9Router
        async function discoverModels() {
            var discoveryUrls = [
                baseUrl + '/v1/models/web',
                baseUrl + '/models/web',
                baseUrl + '/v1/models',
                baseUrl + '/models',
            ];
            for (var urlIdx = 0; urlIdx < discoveryUrls.length; urlIdx++) {
                var url = discoveryUrls[urlIdx];
                console.log('[SEARCH] discovering models from:', url);
                try {
                    var discResponse = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                            ...(config.search_key ? { 'Authorization': 'Bearer ' + config.search_key } : {})
                        },
                        signal: AbortSignal.timeout(10000),
                    });
                    console.log('[SEARCH] discovery response:', discResponse.status);
                    if (!discResponse.ok) {
                        console.warn('[SEARCH] discovery endpoint ' + url + ' returned:', discResponse.status);
                        continue;
                    }
                    var respBody = await discResponse.text();
                    console.log('[SEARCH] discovery raw response:', respBody.substring(0, 500));
                    var data = JSON.parse(respBody);
                    if (data && data.data) {
                        var searchModels = data.data.map(function(m) { return m.id; }).filter(Boolean);
                        console.log('[SEARCH] discovered models:', searchModels.join(', ') || 'none (data.data was empty)');
                        return searchModels;
                    }
                } catch (e) {
                    console.error('[SEARCH] discovery error for ' + url + ':', e.message);
                }
            }
            console.error('[SEARCH] all discovery endpoints failed');
            return null;
        }

        res.set({
            'Access-Control-Allow-Origin':  req.headers.origin || '',
            'Access-Control-Allow-Credentials': 'true',
        });

        // Build list of models to try: client-requested first, then known models
        var modelsToTry = [];
        if (json.model && json.model !== 'search-combo') modelsToTry.push(json.model);
        modelsToTry.push('search-combo');
        knownSearchModels.forEach(function(m) {
            if (modelsToTry.indexOf(m) === -1) modelsToTry.push(m);
        });

        var response = null;
        var lastErrorBody = '';
        var workingModel = null;
        var attemptedModels = [];

        for (var i = 0; i < modelsToTry.length; i++) {
            var modelName = modelsToTry[i];
            response = await trySearch(modelName);
            attemptedModels.push(modelName);

            if (response.ok) {
                console.log('[SEARCH] success with model:', modelName);
                workingModel = modelName;
                break;
            }

            // Read and log error body
            lastErrorBody = await response.text().catch(() => '(unreadable body)');
            console.warn('[SEARCH] model "' + modelName + '" failed (' + response.status + '):', lastErrorBody.substring(0, 300));

            if (response.status === 400 || response.status === 404) {
                // Model not found, try next
                continue;
            } else if (response.status === 401) {
                console.error('[SEARCH] Unauthorized — check API key!');
                break;
            } else {
                // Other error (timeout, 500, etc.) — stop trying
                console.error('[SEARCH] non-retryable error:', response.status);
                break;
            }
        }

        if (!response || !response.ok) {
            console.error('[SEARCH] all models failed. Last error:', lastErrorBody.substring(0, 500));
            return res.status(response ? response.status : 500).json({
                error: 'Search upstream error: ' + (response ? response.status : 500) + ' ' + lastErrorBody,
                debug: {
                    attempted_models: attemptedModels,
                    working_model: workingModel || null,
                    requested_model: json.model || null,
                    has_api_key: !!config.search_key,
                    api_key_prefix: config.search_key ? config.search_key.substring(0, 8) + '...' : 'NOT SET',
                    ninerouter_key_env: !!process.env.NINEROUTER_KEY,
                    api_key_env: !!process.env.API_KEY,
                    search_base: config.search_base,
                    last_error: lastErrorBody.substring(0, 500)
                }
            });
        }

        // Stream or return JSON search results
        const contentType = response.headers.get('content-type') || '';
        console.log('[SEARCH] content-type:', contentType);
        if (contentType.includes('application/json')) {
            const data = await response.json();
            console.log('[SEARCH] results count:', data?.results?.length || 0);
            if (data?.answer) console.log('[SEARCH] has direct answer');
            return res.json(data);
        }

        // Fallback: stream raw response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(decoder.decode(value, { stream: true }));
        }
        res.end();

    } catch (err) {
        console.error('[SEARCH ERROR]', err);
        if (err.name === 'AbortError' || err.name === 'TimeoutError') {
            console.error('[SEARCH] upstream request timed out (30s)');
            if (!res.headersSent) {
                res.status(504).json({ error: 'Search upstream timed out' });
            }
        } else if (!res.headersSent) {
            res.status(500).json({ error: err.message || 'Search failed' });
        }
        res.end();
    }
});

// GET endpoint: list available search models
app.get('/api/search/models', async (req, res) => {
    try {
        const baseUrl = config.search_base.replace(/\/+$/, '');
        const headers = { 'Accept': 'application/json' };
        if (config.search_key) {
            headers['Authorization'] = 'Bearer ' + config.search_key;
        }

        var allModels = [];
        var discoveryUrls = [baseUrl + '/v1/models/web', baseUrl + '/v1/models'];

        for (var i = 0; i < discoveryUrls.length; i++) {
            try {
                console.log('[SEARCH MODELS] trying:', discoveryUrls[i]);
                var response = await fetch(discoveryUrls[i], {
                    method: 'GET',
                    headers,
                    signal: AbortSignal.timeout(10000),
                });
                if (!response.ok) {
                    console.warn('[SEARCH MODELS] endpoint returned:', response.status);
                    continue;
                }
                var respBody = await response.text();
                console.log('[SEARCH MODELS] raw response:', respBody.substring(0, 500));
                var data = JSON.parse(respBody);
                if (data && data.data) {
                    var ids = data.data.map(function(m) { return m.id; }).filter(Boolean);
                    console.log('[SEARCH MODELS] found:', ids.join(', ') || '(empty)');
                    if (ids.length > 0) allModels = allModels.concat(ids);
                    break;
                }
            } catch (e) {
                console.error('[SEARCH MODELS] error:', e.message);
            }
        }

        // Fallback: known models if discovery returns nothing
        if (allModels.length === 0) {
            console.warn('[SEARCH MODELS] no models discovered, returning known model list');
            allModels = ['tavily/search', 'search-combo', 'web-search', 'brave/search'];
        }

        res.set({
            'Access-Control-Allow-Origin': req.headers.origin || '',
            'Access-Control-Allow-Credentials': 'true',
        });
        res.json({
            object: 'list',
            data: allModels.map(function(id) { return { id: id }; }),
            debug: {
                search_base: config.search_base,
                has_api_key: !!config.search_key,
                ninerouter_key_env: !!process.env.NINEROUTER_KEY,
                api_key_env: !!process.env.API_KEY
            }
        });
    } catch (err) {
        console.error('[SEARCH MODELS ERROR]', err);
        res.status(500).json({ error: err.message || 'Failed to fetch models' });
    }
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
        let csrfValid = false;
        if (csrf && sessionCsrf && csrf.length === sessionCsrf.length) {
            csrfValid = crypto.timingSafeEqual(
                Buffer.from(csrf, 'utf8'),
                Buffer.from(sessionCsrf, 'utf8')
            );
        }
        if (!csrfValid) {
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

        // ── 6b. Inject web search capability instructions ─────────────
        const searchSystem = {
            role: 'system',
            content: 'شما دسترسی به جستجوی وب دارید. وقتی کاربر بخواهد درباره‌ی موضوعی جستجو کند (مثل "جستجو کن", "جستجو بکن", "سرچ کن", "سرچ بکن", "بگرد", "دنبال ... بگرد", "look up", "search for")، سیستم به‌طور خودکار جستجو می‌کند و نتایج را به‌عنوان زمینه برای شما ارسال می‌کند. شما نیازی ندارید تگ [SEARCH] یا هر فرمت خاصی در خروجی بگذارید — فقط زمانی که نتایج جستجو آماده شد، بر اساس آن پاسخ دهید.',
        };
        json.messages.unshift(searchSystem);

        const forwardBody = JSON.stringify(json, null, 0);
        log(`Forwarding request: model=${json.model}, messages=${json.messages.length}`);

        // ── 7. Check API key ─────────────────────────────────────────
        if (!config.api_key || config.api_key === 'YOUR_API_KEY_HERE') {
            logError('API key not configured');
            res.status(503);
            res.set('Content-Type', 'application/json');
            res.json({ error: 'Server configuration error: API key not set. Please contact the administrator.' });
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
            res.set('Content-Type', 'application/json');
            res.json({ error: 'Internal server error', detail: err.message || String(err) });
        }
        res.end();
    }
});

// ── Pages: Updates ─────────────────────────────────────────────────
// GET /pages/updates — serve updates page
app.get('/pages/updates', (_req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'updates', 'index.html'));
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