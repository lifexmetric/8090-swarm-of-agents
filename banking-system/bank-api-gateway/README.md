# bank-api-gateway

Single entry-point API gateway for the banking system. Runs on port **3000** (or `PORT` env var). Every inbound request is Morgan-logged and rate-limited (100 req / 15 min per IP). All routes under `/api/*` except `/api/auth/*` require a valid JWT, which is verified by delegating to the **auth-service**.

---

## Route Table

| Prefix | Downstream Service | Auth Required |
|---|---|---|
| `POST /api/auth/login` | auth-service | No |
| `POST /api/auth/register` | auth-service | No |
| `GET /api/auth/refresh` | auth-service | No |
| `GET/POST /api/accounts/*` | accounts-service | Yes |
| `GET/POST /api/payments/*` | payments-service | Yes |
| `GET/POST /api/customers/*` | customer-service | Yes |
| `POST /api/reports/graphql` | reporting-service (`/graphql`) | Yes |
| `GET /health` | (gateway itself) | No |

---

## JWT Requirement

Include a valid JWT in every authenticated request:

```
Authorization: Bearer <token>
```

The gateway calls `GET {AUTH_SERVICE_URL}/auth/verify` with the same header. On success it sets `req.user` from the auth-service response and forwards the request downstream. Failures return:

| Condition | HTTP Status | Body |
|---|---|---|
| Header absent | `401` | `{ "error": "Missing authorization header" }` |
| Token invalid / expired | `401` | `{ "error": "Invalid or expired token" }` |
| Auth-service unreachable | `503` | `{ "error": "Auth service unavailable" }` |
| Downstream service down | `502` | `{ "error": "Service unavailable" }` |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the gateway listens on |
| `AUTH_SERVICE_URL` | `http://localhost:4000` | Base URL of the auth-service |
| `ACCOUNTS_SERVICE_URL` | `http://localhost:4001` | Base URL of the accounts-service |
| `PAYMENTS_SERVICE_URL` | `http://localhost:4002` | Base URL of the payments-service |
| `CUSTOMER_SERVICE_URL` | `http://localhost:4003` | Base URL of the customer-service |
| `REPORTING_SERVICE_URL` | `http://localhost:4004` | Base URL of the reporting-service |

Create a `.env` file at the project root (copied from `.env.example`) and adjust values for your environment.

---

## Running locally

```bash
npm install
npm start
# Gateway starts on http://localhost:3000
```

## Docker

```bash
docker build -t bank-api-gateway .
docker run -p 3000:3000 \
  -e AUTH_SERVICE_URL=http://auth-service:4000 \
  -e ACCOUNTS_SERVICE_URL=http://accounts-service:4001 \
  -e PAYMENTS_SERVICE_URL=http://payments-service:4002 \
  -e CUSTOMER_SERVICE_URL=http://customer-service:4003 \
  -e REPORTING_SERVICE_URL=http://reporting-service:4004 \
  bank-api-gateway
```

## nginx

`nginx/nginx.conf` provides an nginx reverse-proxy config that sits in front of the gateway (port 80 → 3000). Useful when deploying behind a load balancer or when you need TLS termination at the nginx layer.
