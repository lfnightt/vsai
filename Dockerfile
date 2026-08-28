# ── Dockerfile for VS-AI chat application ──────────────────────────
# Node.js 18 + Express server designed for Railway.app.
# Railway injects a dynamic $PORT env var at runtime.

FROM node:18-alpine

WORKDIR /app

# Install dependencies first (Docker layer caching)
COPY package.json ./
RUN npm install --only=production

# Copy application source
COPY . .

# Expose port (Railway overrides with $PORT at runtime)
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
