FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY ledger-domain/core-ledger-service/service.config.json ./service.config.json
COPY ledger-domain/core-ledger-service/src ./src
ENV NODE_ENV=production
EXPOSE 8130
CMD ["node", "server.mjs"]
