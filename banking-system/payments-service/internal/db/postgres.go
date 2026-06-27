package db

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/bank/payments-service/internal/model"
	"github.com/jackc/pgx/v5/pgxpool"
)

var pool *pgxpool.Pool

func InitPool(ctx context.Context) error {
	host := os.Getenv("POSTGRES_BANK_HOST")
	if host == "" {
		host = "localhost"
	}
	port := os.Getenv("POSTGRES_BANK_PORT")
	if port == "" {
		port = "5433"
	}
	dbname := os.Getenv("POSTGRES_BANK_DB")
	if dbname == "" {
		dbname = "bank_db"
	}
	user := os.Getenv("POSTGRES_BANK_USER")
	if user == "" {
		user = "bank_user"
	}
	password := os.Getenv("POSTGRES_BANK_PASSWORD")
	if password == "" {
		password = "bank_password"
	}

	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s", user, password, host, port, dbname)
	var err error
	pool, err = pgxpool.New(ctx, dsn)
	return err
}

func GetPool() *pgxpool.Pool { return pool }
func ClosePool()              { if pool != nil { pool.Close() } }

func Ping(ctx context.Context) error {
	if pool == nil {
		return fmt.Errorf("pool not initialized")
	}
	return pool.Ping(ctx)
}

func CreatePayment(ctx context.Context, p *model.Payment) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO payment_orders (id, source_account, destination_account, amount, currency, status, idempotency_key, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		p.ID, p.SourceAccount, p.DestinationAccount, p.Amount, p.Currency, p.Status, p.IdempotencyKey, p.CreatedAt, p.UpdatedAt)
	return err
}

func UpdatePaymentStatus(ctx context.Context, id string, status model.PaymentStatus, swiftID string, errMsg string) error {
	_, err := pool.Exec(ctx, `
		UPDATE payment_orders SET status=$2, swift_transfer_id=$3, error_message=$4, updated_at=$5 WHERE id=$1`,
		id, status, swiftID, errMsg, time.Now())
	return err
}

func GetPaymentByID(ctx context.Context, id string) (*model.Payment, error) {
	p := &model.Payment{}
	err := pool.QueryRow(ctx, `
		SELECT id, source_account, destination_account, amount, currency, status, idempotency_key,
		       COALESCE(swift_transfer_id,''), COALESCE(error_message,''), created_at, updated_at
		FROM payment_orders WHERE id=$1`, id).Scan(
		&p.ID, &p.SourceAccount, &p.DestinationAccount, &p.Amount, &p.Currency, &p.Status,
		&p.IdempotencyKey, &p.SwiftTransferID, &p.ErrorMessage, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func GetPaymentByIdempotencyKey(ctx context.Context, key string) (*model.Payment, error) {
	p := &model.Payment{}
	err := pool.QueryRow(ctx, `
		SELECT id, source_account, destination_account, amount, currency, status, idempotency_key,
		       COALESCE(swift_transfer_id,''), COALESCE(error_message,''), created_at, updated_at
		FROM payment_orders WHERE idempotency_key=$1`, key).Scan(
		&p.ID, &p.SourceAccount, &p.DestinationAccount, &p.Amount, &p.Currency, &p.Status,
		&p.IdempotencyKey, &p.SwiftTransferID, &p.ErrorMessage, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return p, nil
}
