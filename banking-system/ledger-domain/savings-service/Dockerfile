FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY ledger-domain/savings-service/service.config.json ./service.config.json
COPY ledger-domain/savings-service/src ./src
ENV NODE_ENV=production
EXPOSE 8132
CMD ["node", "server.mjs"]
