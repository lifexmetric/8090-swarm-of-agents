FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY channels/atm-gateway-service/service.config.json ./service.config.json
COPY channels/atm-gateway-service/src ./src
ENV NODE_ENV=production
EXPOSE 8103
CMD ["node", "server.mjs"]
