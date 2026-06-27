FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY payments-rails/reconciliation-service/service.config.json ./service.config.json
COPY payments-rails/reconciliation-service/src ./src
ENV NODE_ENV=production
EXPOSE 8145
CMD ["node", "server.mjs"]
