package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/bank/payments-service/internal/db"
	"github.com/bank/payments-service/internal/handler"
	"github.com/bank/payments-service/internal/kafka"
	"github.com/bank/payments-service/internal/swift"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env file if present; ignore error when file doesn't exist
	if err := godotenv.Load(); err != nil {
		log.Printf("No .env file found, using environment variables")
	}

	ctx := context.Background()

	// Retry DB connection — wait for postgres to be ready
	var dbErr error
	for i := 0; i < 10; i++ {
		if dbErr = db.InitPool(ctx); dbErr == nil {
			log.Printf("Connected to PostgreSQL")
			break
		}
		log.Printf("DB not ready, retry %d/10: %v", i+1, dbErr)
		time.Sleep(2 * time.Second)
	}
	if dbErr != nil {
		log.Printf("Warning: could not connect to DB after 10 retries: %v", dbErr)
	}
	defer db.ClosePool()

	// Retry Kafka connection — wait for broker to be ready
	var kafkaErr error
	for i := 0; i < 10; i++ {
		if kafkaErr = kafka.InitProducer(); kafkaErr == nil {
			log.Printf("Connected to Kafka")
			break
		}
		log.Printf("Kafka not ready, retry %d/10: %v", i+1, kafkaErr)
		time.Sleep(2 * time.Second)
	}
	if kafkaErr != nil {
		log.Printf("Warning: could not connect to Kafka after 10 retries: %v", kafkaErr)
	}
	defer kafka.CloseProducer()

	r := gin.Default()
	h := &handler.PaymentHandler{}

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "service": "payments-service"})
	})
	r.GET("/readiness", func(c *gin.Context) {
		ctx := c.Request.Context()
		checks := map[string]string{}
		degraded := false

		if err := db.Ping(ctx); err != nil {
			checks["postgres"] = err.Error()
			degraded = true
		} else {
			checks["postgres"] = "ok"
		}

		if err := kafka.IsHealthy(); err != nil {
			checks["kafka"] = err.Error()
			degraded = true
		} else {
			checks["kafka"] = "ok"
		}

		if err := swift.CheckConnectivity(); err != nil {
			checks["swift"] = err.Error()
			degraded = true
		} else {
			checks["swift"] = "ok"
		}

		if degraded {
			c.JSON(503, gin.H{"status": "degraded", "checks": checks})
			return
		}
		c.JSON(200, gin.H{"status": "ready", "checks": checks})
	})
	r.POST("/payments", h.InitiatePayment)
	r.GET("/payments/:id", h.GetPayment)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8003"
	}
	log.Printf("payments-service starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
