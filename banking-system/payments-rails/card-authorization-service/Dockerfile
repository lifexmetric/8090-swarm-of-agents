FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY payments-rails/card-authorization-service/service.config.json ./service.config.json
COPY payments-rails/card-authorization-service/src ./src
ENV NODE_ENV=production
EXPOSE 8143
CMD ["node", "server.mjs"]
