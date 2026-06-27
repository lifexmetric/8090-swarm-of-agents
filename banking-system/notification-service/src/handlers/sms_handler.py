import logging
import os

logger = logging.getLogger(__name__)
MOCK_EXTERNAL = os.getenv("MOCK_EXTERNAL", "true").lower() == "true"


def send_fraud_alert_sms(to_number: str, payment_id: str, amount: float, fraud_score: float):
    """Send fraud alert via Twilio (or mock)."""
    if MOCK_EXTERNAL:
        logger.warning(
            f"[MOCK SMS] To: {to_number} | FRAUD ALERT: payment {payment_id} "
            f"amount {amount} score {fraud_score:.2f}"
        )
        return

    from twilio.rest import Client

    client = Client(os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN"))
    client.messages.create(
        body=(
            f"FRAUD ALERT: Suspicious payment {payment_id} of ${amount:.2f} detected "
            f"(risk score: {fraud_score:.0%}). Call us if unrecognized."
        ),
        from_=os.getenv("TWILIO_FROM_NUMBER"),
        to=to_number,
    )
    logger.warning(f"Fraud alert SMS sent to {to_number}")
