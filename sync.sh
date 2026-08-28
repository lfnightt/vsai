#!/bin/bash
# ── VS-AI auto-sync script ──────────────────────────────────────────
# Automatically stages, commits, and pushes changes to GitHub (master).
# Also bumps patch version in version.json on each sync.
# Usage: ./sync.sh
set -e
cd "$(dirname "$0")"

# ── Bump patch version ──────────────────────────────────────────────
VERSION_FILE="version.json"
if [ -f "$VERSION_FILE" ]; then
    # Read current version
    CURRENT_VERSION=$(grep -o '"version": "[^"]*"' "$VERSION_FILE" | cut -d'"' -f4)
    if [[ $CURRENT_VERSION =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
        MAJOR="${BASH_REMATCH[1]}"
        MINOR="${BASH_REMATCH[2]}"
        PATCH="${BASH_REMATCH[3]}"
        NEW_PATCH=$((PATCH + 1))
        NEW_VERSION="${MAJOR}.${MINOR}.${NEW_PATCH}"
        
        # Update version.json with new version and build date
        BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
        cat > "$VERSION_FILE" <<EOF
{
  "version": "$NEW_VERSION",
  "name": "VS-AI",
  "description": "AI Chat Assistant",
  "buildDate": "$BUILD_DATE",
  "commit": "auto"
}
EOF
        echo "🔖 Version bumped: $CURRENT_VERSION → $NEW_VERSION"
    fi
fi

git add -A

if git diff --cached --quiet; then
    echo "ℹ️  No changes to sync."
    exit 0
fi

# Get version for commit message
VERSION=$(grep -o '"version": "[^"]*"' "$VERSION_FILE" | cut -d'"' -f4)
timestamp=$(date '+%Y-%m-%d %H:%M:%S')
git commit -m "Auto-sync v${VERSION}: ${timestamp}"
git push origin master

echo ""
echo "✅ Changes synced to GitHub!"
echo "   Version: v${VERSION}"
echo "   Railway will auto-deploy on the next build."