.PHONY: start stop restart seed seed-graph demo-payment logs status

start:
	docker compose up --build -d
	@echo "Waiting for services to be ready..."
	@sleep 15
	@echo ""
	@echo "Banking system running:"
	@echo "  API Gateway:       http://localhost:3000"
	@echo "  Auth Service:      http://localhost:8001/docs"
	@echo "  Accounts Service:  http://localhost:8002"
	@echo "  Payments Service:  http://localhost:8003"
	@echo "  Fraud Service:     http://localhost:8004/docs"
	@echo "  Customer Service:  http://localhost:8005"
	@echo "  Reporting Service: http://localhost:8007/graphql"
	@echo "  Neo4j Browser:     http://localhost:7474"
	@echo "  Mock SWIFT Rail:   http://localhost:9999"

stop:
	docker compose down

restart:
	docker compose down
	docker compose up --build -d

seed: seed-db seed-graph seed-customers
	@echo "All seed data loaded."

seed-db:
	@echo "Seeding auth database..."
	docker compose exec postgres-auth psql -U auth_user -d auth_db -f /docker-entrypoint-initdb.d/001_create_users.sql 2>/dev/null || true
	@echo "Auth DB seeded."

seed-graph:
	@echo "Seeding Neo4j fraud graph..."
	docker compose exec fraud-detection-service python seeds/seed_graph.py
	@echo "Neo4j fraud graph seeded."

seed-customers:
	@echo "Seeding MongoDB customers..."
	docker compose exec customer-service node seeds/seed_customers.js
	@echo "MongoDB customers seeded."

logs:
	docker compose logs -f --tail=50

logs-%:
	docker compose logs -f --tail=100 $*

status:
	docker compose ps

# ── Demo: Full Payment Flow ────────────────────────────────────────────────
demo-payment:
	@echo "Step 1: Login as alice..."
	$(eval TOKEN := $(shell curl -s -X POST http://localhost:3000/api/auth/login \
		-H "Content-Type: application/json" \
		-d '{"username":"alice","password":"password123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])"))
	@echo "Got token: $(TOKEN)"
	@echo ""
	@echo "Step 2: Check account balance..."
	curl -s -H "Authorization: Bearer $(TOKEN)" \
		http://localhost:3000/api/accounts/acc-alice-001/balance | python3 -m json.tool
	@echo ""
	@echo "Step 3: Initiate payment..."
	curl -s -X POST http://localhost:3000/api/payments \
		-H "Authorization: Bearer $(TOKEN)" \
		-H "Content-Type: application/json" \
		-d '{"source_account":"acc-alice-001","destination_account":"acc-bob-001","amount":100.00,"currency":"USD","idempotency_key":"demo-$(shell date +%s)"}' \
		| python3 -m json.tool
	@echo ""
	@echo "Step 4: Check Kafka events (last 5 messages on payment.initiated)..."
	docker compose exec kafka kafka-console-consumer \
		--bootstrap-server localhost:9092 \
		--topic payment.initiated \
		--from-beginning \
		--max-messages 5 \
		--timeout-ms 3000 2>/dev/null || true

# ── Break the SWIFT connection (for demo) ─────────────────────────────────
break-swift:
	@echo "Introducing breaking change: changing /v2/transfers to /v3/transfers..."
	sed -i '' 's|/v2/transfers|/v3/transfers|g' payments-service/internal/swift/client.go
	cd .. && git add banking-system/payments-service/internal/swift/client.go && \
		git commit -m "feat(payments): upgrade SWIFT rail integration to v3 API" 2>/dev/null || true
	docker compose up --build -d payments-service
	@echo "Breaking change applied and committed. Run 'make demo-payment' to see it fail."

fix-swift:
	@echo "Reverting breaking change..."
	sed -i '' 's|/v3/transfers|/v2/transfers|g' payments-service/internal/swift/client.go
	cd .. && git add banking-system/payments-service/internal/swift/client.go && \
		git commit -m "fix(payments): revert SWIFT rail endpoint to v2" 2>/dev/null || true
	docker compose up --build -d payments-service
	@echo "Fixed. Run 'make demo-payment' to verify."
