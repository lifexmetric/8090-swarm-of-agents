FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY customer-domain/document-verification-service/service.config.json ./service.config.json
COPY customer-domain/document-verification-service/src ./src
ENV NODE_ENV=production
EXPOSE 8122
CMD ["node", "server.mjs"]
