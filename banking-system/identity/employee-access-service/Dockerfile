FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY identity/employee-access-service/service.config.json ./service.config.json
COPY identity/employee-access-service/src ./src
ENV NODE_ENV=production
EXPOSE 8114
CMD ["node", "server.mjs"]
