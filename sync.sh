#!/bin/bash
# ── VS-AI auto-sync script ──────────────────────────────────────────
# Automatically stages, commits, and pushes changes to GitHub (master).
# Usage: ./sync.sh
set -e
cd "$(dirname "$0")"

git add -A

if git diff --cached --quiet; then
    echo "ℹ️  No changes to sync."
    exit 0
fi

timestamp=$(date '+%Y-%m-%d %H:%M:%S')
git commit -m "Auto-sync: ${timestamp}"
git push origin master

echo ""
echo "✅ Changes synced to GitHub!"
echo "   Railway will auto-deploy on the next build."
