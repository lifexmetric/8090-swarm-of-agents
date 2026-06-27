FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY identity/session-risk-service/service.config.json ./service.config.json
COPY identity/session-risk-service/src ./src
ENV NODE_ENV=production
EXPOSE 8113
CMD ["node", "server.mjs"]
