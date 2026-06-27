FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY regions/apac-routing-service/service.config.json ./service.config.json
COPY regions/apac-routing-service/src ./src
ENV NODE_ENV=production
EXPOSE 8182
CMD ["node", "server.mjs"]
