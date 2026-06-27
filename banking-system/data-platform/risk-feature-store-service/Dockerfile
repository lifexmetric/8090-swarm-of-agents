FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY data-platform/risk-feature-store-service/service.config.json ./service.config.json
COPY data-platform/risk-feature-store-service/src ./src
ENV NODE_ENV=production
EXPOSE 8162
CMD ["node", "server.mjs"]
