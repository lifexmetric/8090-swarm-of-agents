FROM node:20-alpine
WORKDIR /app
COPY shared/global-service-runtime/server.mjs ./server.mjs
COPY customer-domain/kyc-orchestration-service/service.config.json ./service.config.json
COPY customer-domain/kyc-orchestration-service/src ./src
ENV NODE_ENV=production
EXPOSE 8121
CMD ["node", "server.mjs"]
