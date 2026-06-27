import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

import strawberry
from fastapi import FastAPI
from strawberry.fastapi import GraphQLRouter

from .db import postgres, mongodb
from . import resolvers
from .schema import AccountType, TransactionType, CustomerSummaryType, CustomerType

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@strawberry.type
class Query:
    @strawberry.field
    async def account(self, id: str) -> Optional[AccountType]:
        return await resolvers.resolve_account(id)

    @strawberry.field
    async def transactions(self, account_id: str, limit: int = 20) -> list[TransactionType]:
        return await resolvers.resolve_transactions(account_id, limit)

    @strawberry.field
    async def customer_summary(self, customer_id: str) -> Optional[CustomerSummaryType]:
        return await resolvers.resolve_customer_summary(customer_id)

    @strawberry.field
    async def customers(self, limit: int = 20) -> list[CustomerType]:
        return await resolvers.resolve_customers_list(limit)


schema = strawberry.Schema(query=Query)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up: initializing database connections...")
    await postgres.init_pool()
    await mongodb.init_db()
    logger.info("Database connections established.")
    yield
    logger.info("Shutting down: closing database connections...")
    await postgres.close_pool()
    await mongodb.close_db()
    logger.info("Database connections closed.")


app = FastAPI(title="Reporting Service", version="1.0.0", lifespan=lifespan)

graphql_app = GraphQLRouter(schema)
app.include_router(graphql_app, prefix="/graphql")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "reporting-service"}
