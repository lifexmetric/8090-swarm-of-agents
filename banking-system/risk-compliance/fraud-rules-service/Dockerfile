FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY risk-compliance/fraud-rules-service/service.config.json ./service.config.json
COPY risk-compliance/fraud-rules-service/src ./src
ENV NODE_ENV=production
EXPOSE 8153
CMD ["node", "server.mjs"]
