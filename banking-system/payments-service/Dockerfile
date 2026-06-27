FROM golang:1.26-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o payments-service ./cmd/server

FROM alpine:3.20
WORKDIR /app
COPY --from=build /app/payments-service .
EXPOSE 8003
CMD ["./payments-service"]
