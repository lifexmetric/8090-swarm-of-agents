-- 002_create_payments.sql
-- Initializes the payment_orders table for the bank_db database.

CREATE TABLE IF NOT EXISTS payment_orders (
    id VARCHAR(50) PRIMARY KEY,
    source_account VARCHAR(50) NOT NULL,
    destination_account VARCHAR(50) NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    idempotency_key VARCHAR(100) UNIQUE NOT NULL,
    swift_transfer_id VARCHAR(100),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_idempotency ON payment_orders(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_payment_orders_source ON payment_orders(source_account);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
