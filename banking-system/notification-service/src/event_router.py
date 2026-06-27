import logging
from .handlers import email_handler, sms_handler

logger = logging.getLogger(__name__)

# Hardcoded customer contact info for demo.
# In a production system this would call the customer-service API.
CUSTOMER_CONTACTS = {
    "acc-alice-001":   {"email": "alice@bank.example.com",   "phone": "+15550001001"},
    "acc-alice-002":   {"email": "alice@bank.example.com",   "phone": "+15550001001"},
    "acc-bob-001":     {"email": "bob@bank.example.com",     "phone": "+15550001002"},
    "acc-charlie-001": {"email": "charlie@bank.example.com", "phone": "+15550001003"},
}


def route_event(topic: str, event: dict):
    """Route a Kafka event to the appropriate notification handler."""
    try:
        if topic == "payment.completed":
            source_account = event.get("source_account", "")
            contact = CUSTOMER_CONTACTS.get(source_account, {})
            if contact:
                email_handler.send_payment_confirmation(
                    contact["email"],
                    event.get("payment_id", ""),
                    event.get("amount", 0),
                    event.get("currency", "USD"),
                )
            else:
                logger.warning(
                    f"No contact found for account '{source_account}' on topic {topic}"
                )

        elif topic == "fraud.alert":
            source_account = event.get("source_account", "")
            contact = CUSTOMER_CONTACTS.get(source_account, {})
            if contact:
                sms_handler.send_fraud_alert_sms(
                    contact["phone"],
                    event.get("payment_id", ""),
                    event.get("amount", 0),
                    event.get("fraud_score", 0.0),
                )
            else:
                logger.warning(
                    f"No contact found for account '{source_account}' on topic {topic}"
                )

        elif topic == "account.updated":
            account_id = event.get("account_id", "")
            contact = CUSTOMER_CONTACTS.get(account_id, {})
            if contact:
                email_handler.send_account_update_digest(
                    contact["email"],
                    account_id,
                    event.get("new_balance", 0),
                    event.get("currency", "USD"),
                )
            else:
                logger.warning(
                    f"No contact found for account '{account_id}' on topic {topic}"
                )

        else:
            logger.warning(f"Unknown topic: {topic}")

    except Exception as e:
        logger.error(f"Error routing event from topic '{topic}': {e}", exc_info=True)
