# Образ демо-стенда «МГИМО Мания»: Node.js 24, без сборки фронтенда
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DB_FILE=/data/mgimo.db \
    TRUST_PROXY=1

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY public ./public

# База демо пересоздаётся при старте, если её нет; каталог можно смонтировать как том
RUN mkdir -p /data && chown -R node:node /data
USER node

EXPOSE 3000
# Готовность: база открыта и наполнена (GET /api/health отвечает 503, если данных нет)
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1
CMD ["node", "server/index.js"]
