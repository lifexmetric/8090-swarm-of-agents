FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY data-platform/reporting-marts-service/service.config.json ./service.config.json
COPY data-platform/reporting-marts-service/src ./src
ENV NODE_ENV=production
EXPOSE 8163
CMD ["node", "server.mjs"]
