FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY customer-domain/customer-profile-service/service.config.json ./service.config.json
COPY customer-domain/customer-profile-service/src ./src
ENV NODE_ENV=production
EXPOSE 8120
CMD ["node", "server.mjs"]
