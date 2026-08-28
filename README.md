# VS-AI — AI Chat Application (Node.js)

A lightweight web chat application that proxies requests to an
OpenAI-compatible API backend. Built with **Node.js + Express** and
deployed on [Railway.app](https://railway.app/).

## Project Structure

```
├── Dockerfile          — Node.js 18 Alpine container for Railway
├── package.json        — Node.js dependencies + start script
├── server.js           — Express server (API proxy + static serving)
├── start.sh            — Local dev startup script
├── sync.sh             — Auto-sync script (git add + commit + push)
├── .dockerignore       — Files excluded from Docker build
├── .gitignore          — Files excluded from version control
├── .htaccess           — Apache config (legacy/compatibility)
├── index.html          — Root page (redirect to /chat)
├── chat.html           — Chat UI (static HTML + React frontend)
├── chat-logo.svg       — Logo
├── favicon.ico         — Favicon
├── site.webmanifest    — PWA manifest
├── chat-assets/
│   └── chat.css        — Chat UI styles
├── chatapp/
│   └── chat-app.min.js — Frontend bundle (React-based)
└── vendor/
    ├── css/            — KaTeX, Highlight.js CSS
    ├── fonts/          — Inter font
    └── js/             — React, KaTeX, Marked, Highlight.js
```

## Architecture

| Component       | Description                                            |
|-----------------|--------------------------------------------------------|
| **Express**     | Web server + API proxy (replaces PHP mod_php)         |
| **PHP-FPM**     | — ❌ Removed (was causing MPM conflicts on Railway)  |
| **Nginx**       | — ❌ Removed (not needed with Express)                |
| **Node.js**     | Runtime (v18+ LTS, native `fetch` for streaming)       |

## Security Features (`server.js`)

1. **Same-origin enforcement** — validates `Referer` / `Origin` headers
2. **CSRF protection** — session-bound token, checked via `X-CSRF-TOKEN` header
3. **Rate limiting** — per-IP, in-memory sliding-window, 30 req / 60 s
4. **Server-side API key** — injected at the proxy, never exposed to browser
5. **Request sanitisation** — validates `messages` array before forwarding
6. **Hidden upstream URL** — upstream API address never reaches the client
7. **SSE streaming** — real-time response streaming via Server-Sent Events

## Environment Variables

Set these in Railway project settings or locally in a `.env` file:

| Variable         | Default                                        | Description                          |
|------------------|------------------------------------------------|--------------------------------------|
| `API_KEY`        | `YOUR_API_KEY_HERE`                            | Secret API key (starts with `sk-`)   |
| `API_BASE`       | `https://9router-production-aa27.up.railway.app/v1` | Upstream API base URL          |
| `MODEL`          | `OpenCode`                                     | Model identifier                     |
| `ALLOWED_ORIGINS`| *(empty = same-origin check)*                  | Comma-separated allowed origins      |
| `CHECK_REFERER`  | `true`                                         | Set to `false` to disable            |
| `RATE_LIMIT`     | `30`                                           | Requests per IP per 60s (0 = disable) |
| `SESSION_SECRET` | *(auto-generated)*                             | Session signing secret               |
| `PORT`           | `8080`                                         | Server port (set by Railway)         |

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Set environment variables
export API_KEY="your-api-key-here"
export API_BASE="https://your-router.up.railway.app/v1"

# 3. Start the server
npm start
# Or: ./start.sh
```

## Deployment on Railway

### Option A — Connect GitHub (automatic deploys)

1. Push this repo to GitHub: `git push origin master`
2. In Railway, create a new project → "Deploy from GitHub repo"
3. Select `lfnightt/vsai`
4. Railway auto-detects the `Dockerfile` and builds:
   - `FROM node:18-alpine`
   - Runs `npm install --only=production`
   - Copies source code
   - Runs `npm start` → `node server.js`
5. Set environment variables in Railway project settings (see table above)

Railway automatically deploys on every push to `master`.

### Option B — Railway CLI (manual deploys)

```bash
npm i -g railway
railway login
railway link
railway up
```

## Syncing Changes to GitHub

```bash
# Quick sync (Unix/macOS)
./sync.sh

# Manual git commands
git add -A
git commit -m "your message"
git push origin master
```

## Files Excluded from Git

| File / Pattern      | Reason                          |
|---------------------|---------------------------------|
| `node_modules/`     | Installed by npm at build time  |
| `package-lock.json` | Lock file (optional)            |
| `VS-AI.zip`         | Local archive                   |
| `config.php`        | Removed — now uses env vars     |
| `.env`              | Local environment variables     |
| `*.bat`             | Windows scripts (local use)     |
