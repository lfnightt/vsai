# VS-AI — AI Chat Application

A lightweight PHP-based web chat application that proxies requests to an
OpenAI-compatible API backend. Designed for deployment on
[Railway.app](https://railway.app/).

## Project Structure

```
├── .htaccess              — Apache URL rewriting & security headers
├── Dockerfile             — PHP-FPM + Nginx container for Railway
├── nginx.conf             — Nginx config (mirrors .htaccess rules)
├── start.sh               — Dynamic PORT + start PHP-FPM & Nginx
├── config.php             — Local configuration (NOT in version control)
├── config.php.example     — Template read from environment variables
├── api.php                — Secure API proxy (SSE streaming)
├── chat.php               — Chat UI entry point
├── index.php              — Root redirector → /chat
├── chat-assets/
│   └── chat.css            — Chat UI styles
├── chatapp/
│   └── chat-app.min.js     — Frontend bundle (React-based)
└── vendor/
    ├── css/               — KaTeX, Highlight.js CSS
    ├── fonts/             — Inter font
    └── js/                — React, KaTeX, Marked, Highlight.js
```

## Architecture

**Container stack:** PHP-FPM (FastCGI) + Nginx + Ubuntu/Debian

- **PHP-FPM**: Processes PHP files (api.php, chat.php, config.php)
  - Listens on `127.0.0.1:9000`
  - Extensions: curl, mbstring, session, json, hash, pdo_mysql
- **Nginx**: Web server handling HTTP requests, URL rewriting, and static files
  - Dynamic `PORT` from Railway environment variable
  - Security headers (nosniff, frame-options, XSS protection, etc.)
  - .htaccess URL rewrites converted to native Nginx directives

## Security Features (`api.php`)

1. **Same-origin enforcement** — validates `Referer` / `Origin` headers
2. **CSRF protection** — requires a valid session-bound CSRF token
3. **Rate limiting** — per-IP, file-based, 30 req / 60 s (configurable)
4. **Server-side API key** — never exposed to the browser
5. **Request sanitisation** — validates and forwards only `messages` array
6. **Hidden upstream URL** — upstream API address never reaches the client

## Local Development

```bash
# 1. Copy the example config
cp config.php.example config.php

# 2. Edit config.php with your API key and settings
#    OR set environment variables:
#    API_KEY, API_BASE, MODEL, ALLOWED_ORIGINS, CHECK_REFERER, RATE_LIMIT

# 3. Start a local PHP-FPM server
php-fpm -D
nginx -g 'daemon off;'
```

## Deployment on Railway

### Option A — Connect GitHub (automatic deploys)

1. Push this repo to GitHub: `git push origin master`
2. In Railway, create a new project → "Deploy from GitHub repo"
3. Select `lfnightt/vsai`
4. Railway auto-detects the `Dockerfile` and builds:
   - Base image: `php:8.2-fpm`
   - Installs Nginx
   - Runs `start.sh` which starts PHP-FPM + Nginx on the dynamic `$PORT`
5. Set these environment variables in Railway project settings:
   - `API_KEY` — your secret API key (starts with `sk-`)
   - `API_BASE` — API router URL (e.g. `https://9router-production-aa27.up.railway.app/v1`)
   - `PORT` — automatically set by Railway

Railway automatically deploys on every push to `master`.

### Option B — Railway CLI (manual deploys)

```bash
# Install Railway CLI
npm i -g railway

# Login and link project
railway login
railway link

# Deploy
railway up
```

## Syncing Changes to GitHub

```bash
# Manual git commands
git add -A
git commit -m "your message"
git push origin master
```

After each push, Railway automatically rebuilds and deploys the updated site.

## Files Excluded from Git

| File / Pattern      | Reason                          |
|---------------------|---------------------------------|
| `node_modules/`     | Dependencies, not needed        |
| `package.json`      | Local build config              |
| `package-lock.json` | Lock file                       |
| `VS-AI.zip`         | Local archive                   |
| `config.php`        | Contains secret API key         |
| `.env`              | Local environment variables     |
| `*.bat`             | Windows batch scripts (local)   |
