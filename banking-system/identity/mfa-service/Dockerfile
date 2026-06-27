FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY identity/mfa-service/service.config.json ./service.config.json
COPY identity/mfa-service/src ./src
ENV NODE_ENV=production
EXPOSE 8111
CMD ["node", "server.mjs"]
