FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY risk-compliance/transaction-monitoring-service/service.config.json ./service.config.json
COPY risk-compliance/transaction-monitoring-service/src ./src
ENV NODE_ENV=production
EXPOSE 8152
CMD ["node", "server.mjs"]
