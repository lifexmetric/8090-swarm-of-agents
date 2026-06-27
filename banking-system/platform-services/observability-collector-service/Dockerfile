FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY platform-services/observability-collector-service/service.config.json ./service.config.json
COPY platform-services/observability-collector-service/src ./src
ENV NODE_ENV=production
EXPOSE 8175
CMD ["node", "server.mjs"]
