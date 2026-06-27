FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY identity/iam-service/service.config.json ./service.config.json
COPY identity/iam-service/src ./src
ENV NODE_ENV=production
EXPOSE 8110
CMD ["node", "server.mjs"]
