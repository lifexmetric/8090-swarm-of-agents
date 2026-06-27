FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY risk-compliance/regulatory-reporting-service/service.config.json ./service.config.json
COPY risk-compliance/regulatory-reporting-service/src ./src
ENV NODE_ENV=production
EXPOSE 8155
CMD ["node", "server.mjs"]
