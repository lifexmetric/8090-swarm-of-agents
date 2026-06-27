import logging
import os

from ..graph import queries

logger = logging.getLogger(__name__)


class FraudScorer:
    THRESHOLD: float = float(os.getenv("FRAUD_SCORE_THRESHOLD", "0.7"))

    def compute_score(
        self,
        payment_id: str,
        source: str,
        destination: str,
        amount: float,
    ) -> tuple[float, list[str]]:
        """
        Returns (score 0.0-1.0, list of risk_factors).

        Scoring rules:
          - Velocity: count of transactions in last hour
              >5  → +0.3
              >10 → +0.5
          - Circular: if a circular transaction is detected → +0.4
          - New payee: if source has never paid destination before → +0.2
          - Large amount:
              > 5000  → +0.2
              > 10000 → +0.4
          Score is clamped to 1.0.

        Also records the transaction in the graph after scoring.
        """
        score: float = 0.0
        risk_factors: list[str] = []

        # --- Velocity check ---
        try:
            tx_count_1h = queries.get_transaction_count_last_hour(source)
            if tx_count_1h > 10:
                score += 0.5
                risk_factors.append(
                    f"High velocity: {tx_count_1h} transactions in last hour (>10)"
                )
            elif tx_count_1h > 5:
                score += 0.3
                risk_factors.append(
                    f"Elevated velocity: {tx_count_1h} transactions in last hour (>5)"
                )
        except Exception as e:
            logger.warning(f"Velocity check failed for {source}: {e}")

        # --- Circular transaction check ---
        try:
            circular = queries.detect_circular_transactions(source, destination)
            if circular:
                score += 0.4
                risk_factors.append(
                    f"Circular transaction: {destination} previously sent funds to {source}"
                )
        except Exception as e:
            logger.warning(
                f"Circular transaction check failed for {source} -> {destination}: {e}"
            )

        # --- New payee check ---
        try:
            new_payee = queries.check_new_payee(source, destination)
            if new_payee:
                score += 0.2
                risk_factors.append(
                    f"New payee: {source} has never sent funds to {destination} before"
                )
        except Exception as e:
            logger.warning(
                f"New payee check failed for {source} -> {destination}: {e}"
            )

        # --- Large amount check ---
        if amount > 10_000:
            score += 0.4
            risk_factors.append(f"Very large transaction amount: ${amount:.2f} (>$10,000)")
        elif amount > 5_000:
            score += 0.2
            risk_factors.append(f"Large transaction amount: ${amount:.2f} (>$5,000)")

        # Clamp to [0.0, 1.0]
        score = min(score, 1.0)

        # --- Record transaction in graph AFTER scoring (so new_payee check is accurate) ---
        try:
            queries.record_transaction_in_graph(payment_id, source, destination, amount)
        except Exception as e:
            logger.warning(f"Failed to record transaction {payment_id} in graph: {e}")

        logger.info(
            f"Scored payment {payment_id}: score={score:.2f}, factors={risk_factors}"
        )
        return score, risk_factors

    def is_fraud(self, score: float) -> bool:
        return score >= self.THRESHOLD
