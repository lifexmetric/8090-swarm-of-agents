FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY channels/web-banking-service/service.config.json ./service.config.json
COPY channels/web-banking-service/src ./src
ENV NODE_ENV=production
EXPOSE 8102
CMD ["node", "server.mjs"]
