FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY data-platform/data-lake-ingestion-service/service.config.json ./service.config.json
COPY data-platform/data-lake-ingestion-service/src ./src
ENV NODE_ENV=production
EXPOSE 8160
CMD ["node", "server.mjs"]
