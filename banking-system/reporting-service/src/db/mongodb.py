import motor.motor_asyncio
import os

_client = None
_db = None


async def init_db():
    global _client, _db
    uri = os.getenv(
        "MONGODB_URI",
        "mongodb://mongo_user:mongo_password@localhost:27017/customers_db?authSource=admin",
    )
    _client = motor.motor_asyncio.AsyncIOMotorClient(uri)
    _db = _client[os.getenv("MONGODB_DB", "customers_db")]


async def close_db():
    global _client
    if _client:
        _client.close()


def get_db():
    if _db is None:
        raise RuntimeError("MongoDB not initialized")
    return _db


async def fetch_customer(customer_id: str) -> dict | None:
    """Find customer by _id"""
    doc = await get_db().customers.find_one({"_id": customer_id})
    if doc:
        doc["id"] = str(doc.pop("_id"))
    return doc


async def fetch_customers_list(limit: int = 20) -> list[dict]:
    """Fetch a list of customers"""
    cursor = get_db().customers.find({}).limit(limit)
    results = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        results.append(doc)
    return results
