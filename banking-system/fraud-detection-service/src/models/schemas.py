from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class PaymentEvent(BaseModel):
    payment_id: str
    source_account: str
    destination_account: str
    amount: float
    currency: str
    timestamp: Optional[str] = None


class FraudAlert(BaseModel):
    payment_id: str
    source_account: str
    destination_account: str
    amount: float
    fraud_score: float
    risk_factors: list[str]
    timestamp: str


class FraudScoreResponse(BaseModel):
    account_id: str
    fraud_score: float
    risk_factors: list[str]
    recent_transactions: int
    flagged_patterns: list[str]
