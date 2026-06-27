FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY data-platform/event-warehouse-service/service.config.json ./service.config.json
COPY data-platform/event-warehouse-service/src ./src
ENV NODE_ENV=production
EXPOSE 8161
CMD ["node", "server.mjs"]
