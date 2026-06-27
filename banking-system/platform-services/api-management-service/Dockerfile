FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY platform-services/api-management-service/service.config.json ./service.config.json
COPY platform-services/api-management-service/src ./src
ENV NODE_ENV=production
EXPOSE 8170
CMD ["node", "server.mjs"]
