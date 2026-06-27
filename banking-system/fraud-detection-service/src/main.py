import logging
import os
import threading
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI

load_dotenv()

from .graph.neo4j_client import close_driver, init_driver
from .consumer.kafka_consumer import start_consumer
from .routers.fraud import router as fraud_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialise Neo4j driver
    logger.info("Initialising Neo4j driver...")
    init_driver()
    logger.info("Neo4j driver ready.")

    # Start Kafka consumer in a daemon background thread so it exits with the process
    logger.info("Starting Kafka consumer background thread...")
    consumer_thread = threading.Thread(
        target=start_consumer,
        name="kafka-fraud-consumer",
        daemon=True,
    )
    consumer_thread.start()
    logger.info("Kafka consumer thread started.")

    yield  # Application is running

    # Cleanup on shutdown
    logger.info("Shutting down — closing Neo4j driver.")
    close_driver()


app = FastAPI(
    title="Fraud Detection Service",
    version="1.0.0",
    description=(
        "Real-time fraud detection backed by Neo4j graph analytics and "
        "Kafka event streaming."
    ),
    lifespan=lifespan,
)

app.include_router(fraud_router, tags=["fraud"])


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok", "service": "fraud-detection-service"}
