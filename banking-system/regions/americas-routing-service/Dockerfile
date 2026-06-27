FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY regions/americas-routing-service/service.config.json ./service.config.json
COPY regions/americas-routing-service/src ./src
ENV NODE_ENV=production
EXPOSE 8180
CMD ["node", "server.mjs"]
