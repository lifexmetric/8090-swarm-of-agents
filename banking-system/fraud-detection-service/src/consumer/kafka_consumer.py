import json
import logging
import os
import threading
from datetime import datetime, timezone

from kafka import KafkaConsumer, KafkaProducer

from ..models.schemas import FraudAlert, PaymentEvent
from ..scoring.fraud_scorer import FraudScorer

logger = logging.getLogger(__name__)


def publish_fraud_alert(producer_bootstrap: list[str], alert: FraudAlert) -> None:
    """Publish a fraud alert to Kafka using KafkaProducer."""
    producer = KafkaProducer(
        bootstrap_servers=producer_bootstrap,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        key_serializer=lambda v: v.encode("utf-8") if v else None,
        retries=3,
        acks="all",
    )
    topic = os.getenv("KAFKA_TOPIC_FRAUD_ALERT", "fraud.alert")
    try:
        future = producer.send(
            topic,
            key=alert.payment_id,
            value=alert.model_dump(),
        )
        # Block until the message is actually sent (raises on failure)
        future.get(timeout=10)
        producer.flush()
        logger.info(
            f"Published fraud alert for payment {alert.payment_id} "
            f"(score={alert.fraud_score:.2f}) to topic '{topic}'"
        )
    finally:
        producer.close()


def start_consumer() -> None:
    """
    Run in a background thread.
    Consumes from 'payment.initiated' and runs fraud detection on each event.
    Publishes to 'fraud.alert' when the fraud score exceeds the threshold.
    """
    bootstrap = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092").split(",")
    topic = os.getenv("KAFKA_TOPIC_PAYMENT_INITIATED", "payment.initiated")
    group_id = os.getenv("KAFKA_GROUP_ID_FRAUD", "fraud-detection-group")

    scorer = FraudScorer()

    logger.info(
        f"Connecting Kafka consumer to {bootstrap}, topic='{topic}', group='{group_id}'"
    )

    consumer = KafkaConsumer(
        topic,
        bootstrap_servers=bootstrap,
        group_id=group_id,
        value_deserializer=lambda m: json.loads(m.decode("utf-8")),
        auto_offset_reset="earliest",
        enable_auto_commit=True,
        consumer_timeout_ms=-1,  # block forever
    )

    logger.info(f"Fraud consumer started, listening on topic '{topic}'")

    for message in consumer:
        try:
            event = PaymentEvent(**message.value)
            logger.info(
                f"Received payment event: id={event.payment_id} "
                f"from={event.source_account} to={event.destination_account} "
                f"amount={event.amount} {event.currency}"
            )

            score, risk_factors = scorer.compute_score(
                event.payment_id,
                event.source_account,
                event.destination_account,
                event.amount,
            )

            logger.info(
                f"Payment {event.payment_id}: fraud score={score:.2f}, factors={risk_factors}"
            )

            if scorer.is_fraud(score):
                alert = FraudAlert(
                    payment_id=event.payment_id,
                    source_account=event.source_account,
                    destination_account=event.destination_account,
                    amount=event.amount,
                    fraud_score=score,
                    risk_factors=risk_factors,
                    timestamp=datetime.now(timezone.utc).isoformat(),
                )
                publish_fraud_alert(bootstrap, alert)

        except Exception as e:
            logger.error(
                f"Error processing payment event (partition={message.partition}, "
                f"offset={message.offset}): {e}",
                exc_info=True,
            )
