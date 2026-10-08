FROM node:24-slim

WORKDIR /app
COPY package.json package-lock.json ./
COPY .papi .papi
# postinstall generates the chain descriptors from .papi/metadata (no network needed).
RUN npm ci
COPY tsconfig.json ./
COPY src src

ENV NODE_ENV=production DB_PATH=/data/trades.db
VOLUME /data
EXPOSE 3000
CMD ["node", "src/index.ts"]
