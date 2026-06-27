package model

import "time"

type PaymentStatus string

const (
	StatusPending    PaymentStatus = "pending"
	StatusProcessing PaymentStatus = "processing"
	StatusCompleted  PaymentStatus = "completed"
	StatusFailed     PaymentStatus = "failed"
)

type Payment struct {
	ID                 string        `json:"id" db:"id"`
	SourceAccount      string        `json:"source_account" db:"source_account"`
	DestinationAccount string        `json:"destination_account" db:"destination_account"`
	Amount             float64       `json:"amount" db:"amount"`
	Currency           string        `json:"currency" db:"currency"`
	Status             PaymentStatus `json:"status" db:"status"`
	IdempotencyKey     string        `json:"idempotency_key" db:"idempotency_key"`
	SwiftTransferID    string        `json:"swift_transfer_id,omitempty" db:"swift_transfer_id"`
	ErrorMessage       string        `json:"error_message,omitempty" db:"error_message"`
	CreatedAt          time.Time     `json:"created_at" db:"created_at"`
	UpdatedAt          time.Time     `json:"updated_at" db:"updated_at"`
}

type CreatePaymentRequest struct {
	SourceAccount      string  `json:"source_account" binding:"required"`
	DestinationAccount string  `json:"destination_account" binding:"required"`
	Amount             float64 `json:"amount" binding:"required,gt=0"`
	Currency           string  `json:"currency" binding:"required,len=3"`
	IdempotencyKey     string  `json:"idempotency_key" binding:"required"`
}

type SwiftTransferRequest struct {
	Amount             float64 `json:"amount"`
	Currency           string  `json:"currency"`
	SourceAccount      string  `json:"source_account"`
	DestinationAccount string  `json:"destination_account"`
	IdempotencyKey     string  `json:"idempotency_key"`
}

type SwiftTransferResponse struct {
	TransferID          string `json:"transfer_id"`
	Status              string `json:"status"`
	EstimatedSettlement string `json:"estimated_settlement"`
	Rail                string `json:"rail"`
}
