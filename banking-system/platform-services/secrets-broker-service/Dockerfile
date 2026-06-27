FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY platform-services/secrets-broker-service/service.config.json ./service.config.json
COPY platform-services/secrets-broker-service/src ./src
ENV NODE_ENV=production
EXPOSE 8173
CMD ["node", "server.mjs"]
