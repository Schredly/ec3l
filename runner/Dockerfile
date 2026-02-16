FROM node:20-slim AS base

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY shared/ ./shared/
COPY runner/ ./runner/
COPY tsconfig.json ./

RUN npx tsx --version > /dev/null 2>&1 || npm install tsx

EXPOSE 4001

ENV RUNNER_PORT=4001
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.get('http://localhost:4001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.setTimeout(3000, () => { req.destroy(); process.exit(1); });"

CMD ["npx", "tsx", "runner/main.ts"]
