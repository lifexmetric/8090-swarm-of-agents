from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.db import postgres, redis_client
from src.routers import auth


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await postgres.init_pool()
    await redis_client.init_redis()
    yield
    # Shutdown
    await postgres.close_pool()
    await redis_client.close_redis()


app = FastAPI(
    title="Auth Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "auth-service"}
