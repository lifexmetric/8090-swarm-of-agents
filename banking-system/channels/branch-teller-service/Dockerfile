FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY channels/branch-teller-service/service.config.json ./service.config.json
COPY channels/branch-teller-service/src ./src
ENV NODE_ENV=production
EXPOSE 8104
CMD ["node", "server.mjs"]
