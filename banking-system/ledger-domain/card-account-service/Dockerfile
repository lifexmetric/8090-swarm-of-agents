FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY ledger-domain/card-account-service/service.config.json ./service.config.json
COPY ledger-domain/card-account-service/src ./src
ENV NODE_ENV=production
EXPOSE 8133
CMD ["node", "server.mjs"]
