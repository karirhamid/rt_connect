# ============================================================================
# RT Connect Frontend — multi-stage build:
#   1. Node compiles the React app
#   2. Nginx serves the static files and proxies /api to the backend
# ============================================================================

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Bake the API URL at build time. Default "" → frontend uses relative URLs
# (/api/...) which Nginx proxies to the backend container, so the same image
# works on any LAN IP without rebuilding.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

# Build the React app
#
# Force NODE_ENV=development for the install so npm doesn't skip devDeps
# (Vite is a devDep). The two-stage COPY-then-install-then-COPY pattern
# was wiping node_modules in some hosts; this single COPY + single install
# is bulletproof at the cost of slightly slower incremental rebuilds.
ENV NODE_ENV=development \
    NPM_CONFIG_PRODUCTION=false
COPY . .
RUN npm install --include=dev --no-audit --no-fund \
 && ls node_modules/.bin/vite \
 && npm run build

# ── Stage 2: serve ───────────────────────────────────────────────────────────
FROM nginx:alpine

# Replace default Nginx config with ours (SPA fallback + /api proxy)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
