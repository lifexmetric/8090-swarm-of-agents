CREATE TABLE IF NOT EXISTS accounts (
    id VARCHAR(50) PRIMARY KEY,
    customer_id VARCHAR(50) NOT NULL,
    account_type VARCHAR(20) NOT NULL DEFAULT 'CHECKING',
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    balance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id VARCHAR(50) REFERENCES accounts(id),
    type VARCHAR(10) NOT NULL CHECK (type IN ('DEBIT','CREDIT')),
    amount DECIMAL(18,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    description TEXT,
    reference_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed accounts
INSERT INTO accounts (id, customer_id, account_type, currency, balance, status) VALUES
    ('acc-alice-001', '550e8400-e29b-41d4-a716-446655440001', 'CHECKING', 'USD', 5000.00, 'ACTIVE'),
    ('acc-alice-002', '550e8400-e29b-41d4-a716-446655440001', 'SAVINGS',  'USD', 12000.00, 'ACTIVE'),
    ('acc-bob-001',   '550e8400-e29b-41d4-a716-446655440002', 'CHECKING', 'USD', 3500.00, 'ACTIVE'),
    ('acc-charlie-001','550e8400-e29b-41d4-a716-446655440003','CHECKING', 'USD', 8200.00, 'ACTIVE')
ON CONFLICT (id) DO NOTHING;
