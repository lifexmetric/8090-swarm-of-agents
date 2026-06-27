FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY customer-domain/consent-service/service.config.json ./service.config.json
COPY customer-domain/consent-service/src ./src
ENV NODE_ENV=production
EXPOSE 8123
CMD ["node", "server.mjs"]
