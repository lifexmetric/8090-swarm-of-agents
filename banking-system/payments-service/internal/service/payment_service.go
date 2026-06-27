package service

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/bank/payments-service/internal/db"
	"github.com/bank/payments-service/internal/kafka"
	"github.com/bank/payments-service/internal/model"
	"github.com/bank/payments-service/internal/swift"
	"github.com/google/uuid"
)

func InitiatePayment(ctx context.Context, req model.CreatePaymentRequest) (*model.Payment, error) {
	// Idempotency check — if key exists return existing payment
	existing, err := db.GetPaymentByIdempotencyKey(ctx, req.IdempotencyKey)
	if err == nil && existing != nil {
		return existing, nil
	}

	payment := &model.Payment{
		ID:                 uuid.New().String(),
		SourceAccount:      req.SourceAccount,
		DestinationAccount: req.DestinationAccount,
		Amount:             req.Amount,
		Currency:           req.Currency,
		Status:             model.StatusPending,
		IdempotencyKey:     req.IdempotencyKey,
		CreatedAt:          time.Now(),
		UpdatedAt:          time.Now(),
	}

	if err := db.CreatePayment(ctx, payment); err != nil {
		return nil, fmt.Errorf("failed to save payment: %w", err)
	}

	// Publish payment.initiated event
	topicInitiated := os.Getenv("KAFKA_TOPIC_PAYMENT_INITIATED")
	if topicInitiated == "" {
		topicInitiated = "payment.initiated"
	}
	if err := kafka.PublishEvent(topicInitiated, payment.ID, map[string]interface{}{
		"payment_id":          payment.ID,
		"source_account":      payment.SourceAccount,
		"destination_account": payment.DestinationAccount,
		"amount":              payment.Amount,
		"currency":            payment.Currency,
		"timestamp":           time.Now(),
	}); err != nil {
		log.Printf("Warning: failed to publish payment.initiated for %s: %v", payment.ID, err)
	}

	topicCompleted := os.Getenv("KAFKA_TOPIC_PAYMENT_COMPLETED")
	if topicCompleted == "" {
		topicCompleted = "payment.completed"
	}
	topicFailed := os.Getenv("KAFKA_TOPIC_PAYMENT_FAILED")
	if topicFailed == "" {
		topicFailed = "payment.failed"
	}

	// Call SWIFT rail
	swiftResp, err := swift.InitiateTransfer(model.SwiftTransferRequest{
		Amount:             payment.Amount,
		Currency:           payment.Currency,
		SourceAccount:      payment.SourceAccount,
		DestinationAccount: payment.DestinationAccount,
		IdempotencyKey:     payment.IdempotencyKey,
	})

	if err != nil {
		log.Printf("SWIFT rail error for payment %s: %v", payment.ID, err)
		if updateErr := db.UpdatePaymentStatus(ctx, payment.ID, model.StatusFailed, "", err.Error()); updateErr != nil {
			log.Printf("Warning: failed to update payment status to failed for %s: %v", payment.ID, updateErr)
		}
		payment.Status = model.StatusFailed
		payment.ErrorMessage = err.Error()
		if pubErr := kafka.PublishEvent(topicFailed, payment.ID, map[string]interface{}{
			"payment_id": payment.ID,
			"error":      err.Error(),
			"timestamp":  time.Now(),
		}); pubErr != nil {
			log.Printf("Warning: failed to publish payment.failed for %s: %v", payment.ID, pubErr)
		}
		return payment, fmt.Errorf("payment failed: %w", err)
	}

	if updateErr := db.UpdatePaymentStatus(ctx, payment.ID, model.StatusCompleted, swiftResp.TransferID, ""); updateErr != nil {
		log.Printf("Warning: failed to update payment status to completed for %s: %v", payment.ID, updateErr)
	}
	payment.Status = model.StatusCompleted
	payment.SwiftTransferID = swiftResp.TransferID
	if pubErr := kafka.PublishEvent(topicCompleted, payment.ID, map[string]interface{}{
		"payment_id":       payment.ID,
		"swift_transfer_id": swiftResp.TransferID,
		"amount":           payment.Amount,
		"currency":         payment.Currency,
		"timestamp":        time.Now(),
	}); pubErr != nil {
		log.Printf("Warning: failed to publish payment.completed for %s: %v", payment.ID, pubErr)
	}

	return payment, nil
}

func GetPayment(ctx context.Context, id string) (*model.Payment, error) {
	return db.GetPaymentByID(ctx, id)
}
