FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY payments-rails/settlement-service/service.config.json ./service.config.json
COPY payments-rails/settlement-service/src ./src
ENV NODE_ENV=production
EXPOSE 8144
CMD ["node", "server.mjs"]
