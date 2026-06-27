import json
import logging
import os

from kafka import KafkaConsumer
from ..event_router import route_event

logger = logging.getLogger(__name__)


def run():
    """Start the Kafka consumer loop. Blocks indefinitely."""
    bootstrap_servers = os.getenv(
        "KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"
    ).split(",")

    topics = [
        os.getenv("KAFKA_TOPIC_PAYMENT_COMPLETED", "payment.completed"),
        os.getenv("KAFKA_TOPIC_FRAUD_ALERT", "fraud.alert"),
        os.getenv("KAFKA_TOPIC_ACCOUNT_UPDATED", "account.updated"),
    ]

    group_id = os.getenv("KAFKA_GROUP_ID_NOTIFY", "notification-group")

    logger.info(
        f"Connecting to Kafka at {bootstrap_servers}, "
        f"group_id={group_id}, topics={topics}"
    )

    consumer = KafkaConsumer(
        *topics,
        bootstrap_servers=bootstrap_servers,
        group_id=group_id,
        value_deserializer=lambda m: json.loads(m.decode("utf-8")),
        auto_offset_reset="earliest",
        enable_auto_commit=True,
    )

    logger.info(f"Notification consumer started, listening on: {topics}")

    for message in consumer:
        topic = message.topic
        event = message.value
        logger.info(f"Received event on {topic}: {event}")
        route_event(topic, event)
