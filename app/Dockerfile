# ---------- dependencies ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app
# Where the Next.js server reaches the API; baked into the /api and /uploads rewrites.
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- run (standalone output: only what the server needs) ----------
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/login >/dev/null || exit 1
CMD ["node", "server.js"]
