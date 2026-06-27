import logging

from fastapi import APIRouter, HTTPException

from ..graph import queries
from ..models.schemas import FraudScoreResponse

logger = logging.getLogger(__name__)

router = APIRouter()


def _compute_profile_score(profile: dict) -> tuple[float, list[str], list[str]]:
    """
    Derive a fraud score and risk/pattern flags from a risk profile dict.

    Returns (score, risk_factors, flagged_patterns).
    """
    score: float = 0.0
    risk_factors: list[str] = []
    flagged_patterns: list[str] = []

    tx_24h: int = profile.get("transaction_count_24h", 0)
    unique_7d: int = profile.get("unique_recipients_7d", 0)
    flagged: int = profile.get("flagged_count", 0)

    # --- Velocity (24-hour window) ---
    if tx_24h > 20:
        score += 0.5
        risk_factors.append(f"Very high 24h transaction volume: {tx_24h} transactions")
        flagged_patterns.append("velocity_burst")
    elif tx_24h > 10:
        score += 0.3
        risk_factors.append(f"High 24h transaction volume: {tx_24h} transactions")
        flagged_patterns.append("elevated_velocity")
    elif tx_24h > 5:
        score += 0.15
        risk_factors.append(f"Elevated 24h transaction volume: {tx_24h} transactions")

    # --- Recipient spread (7-day window) ---
    if unique_7d > 15:
        score += 0.2
        risk_factors.append(
            f"Very high number of unique recipients in 7 days: {unique_7d}"
        )
        flagged_patterns.append("recipient_scatter")
    elif unique_7d > 8:
        score += 0.1
        risk_factors.append(f"High number of unique recipients in 7 days: {unique_7d}")

    # --- Circular / flagged transactions ---
    if flagged > 0:
        score += min(flagged * 0.15, 0.4)
        risk_factors.append(f"Involved in {flagged} circular transaction(s)")
        flagged_patterns.append("circular_transactions")

    score = min(score, 1.0)
    return score, risk_factors, flagged_patterns


@router.get("/fraud/score/{account_id}", response_model=FraudScoreResponse)
async def get_fraud_score(account_id: str) -> FraudScoreResponse:
    """
    Retrieve a real-time fraud risk score for the given account based on
    its Neo4j graph profile (transaction velocity, recipient spread, and
    circular-transaction detection).
    """
    try:
        profile = queries.get_account_risk_profile(account_id)
    except RuntimeError as exc:
        # Neo4j driver not initialized (should not happen in production)
        logger.error(f"Neo4j driver error for account {account_id}: {exc}")
        raise HTTPException(status_code=503, detail="Graph database unavailable")
    except Exception as exc:
        logger.error(f"Failed to fetch risk profile for {account_id}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Error fetching risk profile: {exc}"
        )

    score, risk_factors, flagged_patterns = _compute_profile_score(profile)

    return FraudScoreResponse(
        account_id=account_id,
        fraud_score=round(score, 4),
        risk_factors=risk_factors,
        recent_transactions=profile.get("transaction_count_24h", 0),
        flagged_patterns=flagged_patterns,
    )
