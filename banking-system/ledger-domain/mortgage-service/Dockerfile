FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY ledger-domain/mortgage-service/service.config.json ./service.config.json
COPY ledger-domain/mortgage-service/src ./src
ENV NODE_ENV=production
EXPOSE 8135
CMD ["node", "server.mjs"]
