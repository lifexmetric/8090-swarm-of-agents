FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY payments-rails/rtp-rail-service/service.config.json ./service.config.json
COPY payments-rails/rtp-rail-service/src ./src
ENV NODE_ENV=production
EXPOSE 8142
CMD ["node", "server.mjs"]
