import strawberry
from typing import Optional
from datetime import datetime


@strawberry.type
class AccountType:
    id: str
    customer_id: str
    account_type: str
    currency: str
    balance: float
    status: str
    created_at: datetime
    updated_at: datetime


@strawberry.type
class TransactionType:
    id: str
    account_id: str
    type: str  # DEBIT or CREDIT
    amount: float
    currency: str
    description: Optional[str] = None
    reference_id: Optional[str] = None
    created_at: datetime


@strawberry.type
class KYCStatusType:
    status: str
    verified_at: Optional[datetime] = None


@strawberry.type
class AddressType:
    street: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = "CA"


@strawberry.type
class CustomerType:
    id: str
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    kyc_status: Optional[str] = None


@strawberry.type
class CustomerSummaryType:
    customer: CustomerType
    accounts: list[AccountType]
    total_balance: float
