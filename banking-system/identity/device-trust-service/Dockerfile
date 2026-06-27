FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY identity/device-trust-service/service.config.json ./service.config.json
COPY identity/device-trust-service/src ./src
ENV NODE_ENV=production
EXPOSE 8112
CMD ["node", "server.mjs"]
