FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY risk-compliance/case-management-service/service.config.json ./service.config.json
COPY risk-compliance/case-management-service/src ./src
ENV NODE_ENV=production
EXPOSE 8154
CMD ["node", "server.mjs"]
