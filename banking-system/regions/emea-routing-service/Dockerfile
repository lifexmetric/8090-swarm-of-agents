FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY regions/emea-routing-service/service.config.json ./service.config.json
COPY regions/emea-routing-service/src ./src
ENV NODE_ENV=production
EXPOSE 8181
CMD ["node", "server.mjs"]
