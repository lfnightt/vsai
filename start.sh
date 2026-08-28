#!/bin/bash
# ── Start-up script for VS-AI (local development) ────────────────────
# For Docker deployments the Dockerfile uses: CMD ["npm", "start"]
set -e
echo "[start.sh] Starting VS-AI server..."
exec node server.js
