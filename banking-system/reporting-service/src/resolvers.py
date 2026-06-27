from .db import postgres, mongodb
from .schema import AccountType, TransactionType, CustomerType, CustomerSummaryType


async def resolve_account(account_id: str) -> AccountType | None:
    """Fetch account from PostgreSQL"""
    row = await postgres.fetch_account(account_id)
    if not row:
        return None
    return AccountType(**row)


async def resolve_transactions(account_id: str, limit: int = 20) -> list[TransactionType]:
    """Fetch transactions from PostgreSQL"""
    rows = await postgres.fetch_transactions(account_id, limit)
    return [TransactionType(**r) for r in rows]


async def resolve_customer_summary(customer_id: str) -> CustomerSummaryType | None:
    """Fetch customer from MongoDB + accounts from PostgreSQL"""
    customer_doc = await mongodb.fetch_customer(customer_id)
    if not customer_doc:
        return None

    accounts_rows = await postgres.fetch_account_summary_for_customer(customer_id)

    kyc = customer_doc.get("kyc", {})
    customer = CustomerType(
        id=customer_doc["id"],
        first_name=customer_doc.get("firstName", ""),
        last_name=customer_doc.get("lastName", ""),
        email=customer_doc.get("email", ""),
        phone=customer_doc.get("phone"),
        kyc_status=kyc.get("status") if isinstance(kyc, dict) else None,
    )

    accounts = [AccountType(**r) for r in accounts_rows]
    total_balance = sum(a.balance for a in accounts)

    return CustomerSummaryType(customer=customer, accounts=accounts, total_balance=total_balance)


async def resolve_customers_list(limit: int = 20) -> list[CustomerType]:
    """List customers from MongoDB"""
    docs = await mongodb.fetch_customers_list(limit)
    result = []
    for doc in docs:
        kyc = doc.get("kyc", {})
        result.append(
            CustomerType(
                id=doc["id"],
                first_name=doc.get("firstName", ""),
                last_name=doc.get("lastName", ""),
                email=doc.get("email", ""),
                phone=doc.get("phone"),
                kyc_status=kyc.get("status") if isinstance(kyc, dict) else None,
            )
        )
    return result
