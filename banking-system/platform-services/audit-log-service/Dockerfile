FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY platform-services/audit-log-service/service.config.json ./service.config.json
COPY platform-services/audit-log-service/src ./src
ENV NODE_ENV=production
EXPOSE 8174
CMD ["node", "server.mjs"]
