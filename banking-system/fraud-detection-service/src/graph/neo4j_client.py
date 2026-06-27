import os
from neo4j import GraphDatabase

_driver = None


def init_driver():
    global _driver
    uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    user = os.getenv("NEO4J_USER", "neo4j")
    password = os.getenv("NEO4J_PASSWORD", "neo4j_password")
    _driver = GraphDatabase.driver(uri, auth=(user, password))


def close_driver():
    global _driver
    if _driver:
        _driver.close()
        _driver = None


def get_driver():
    if _driver is None:
        raise RuntimeError("Neo4j driver not initialized")
    return _driver
