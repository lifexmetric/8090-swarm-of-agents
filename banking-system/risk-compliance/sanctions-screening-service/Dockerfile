FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY risk-compliance/sanctions-screening-service/service.config.json ./service.config.json
COPY risk-compliance/sanctions-screening-service/src ./src
ENV NODE_ENV=production
EXPOSE 8151
CMD ["node", "server.mjs"]
