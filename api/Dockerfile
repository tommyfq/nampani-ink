# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---------- run ----------
FROM node:20-alpine AS run
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production \
    PORT=4000 \
    CONTENT_FILE=/app/content/studio.json \
    UPLOAD_DIR=/app/uploads

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node content ./content
RUN mkdir -p /app/uploads /app/private && chown node:node /app/uploads /app/private

USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
# Apply pending database migrations, then start the API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
