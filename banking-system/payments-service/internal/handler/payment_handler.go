package handler

import (
	"errors"
	"net/http"

	"github.com/bank/payments-service/internal/model"
	"github.com/bank/payments-service/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

// PaymentHandler holds handler methods for payment endpoints.
type PaymentHandler struct{}

// InitiatePayment handles POST /payments.
// Binds the JSON body to CreatePaymentRequest, calls the service layer,
// and returns 201 on success or 500 on SWIFT/payment failure.
func (h *PaymentHandler) InitiatePayment(c *gin.Context) {
	var req model.CreatePaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	payment, err := service.InitiatePayment(c.Request.Context(), req)
	if err != nil {
		// Payment record exists but failed — return the payment body so the caller
		// can see the failure reason (status, error_message, etc.)
		if payment != nil && payment.Status == model.StatusFailed {
			c.JSON(http.StatusInternalServerError, payment)
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, payment)
}

// GetPayment handles GET /payments/:id.
// Returns 404 if the payment is not found, 200 with the payment on success.
func (h *PaymentHandler) GetPayment(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "payment id is required"})
		return
	}

	payment, err := service.GetPayment(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "payment not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, payment)
}
