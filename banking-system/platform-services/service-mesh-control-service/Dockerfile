FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY platform-services/service-mesh-control-service/service.config.json ./service.config.json
COPY platform-services/service-mesh-control-service/src ./src
ENV NODE_ENV=production
EXPOSE 8171
CMD ["node", "server.mjs"]
