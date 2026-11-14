from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from app.config import MONGO_URI, DB_NAME

# Global client and db reference
_client = None
_db = None

def get_database():
    """Returns the MongoDB database instance."""
    global _client, _db
    if _db is None:
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        _db = _client[DB_NAME]
    return _db

def check_db_connection() -> dict:
    """Checks MongoDB server connectivity and returns status."""
    try:
        db = get_database()
        # Ping the server
        db.command("ping")
        return {
            "status": "connected",
            "database": DB_NAME,
            "error": None
        }
    except (ConnectionFailure, ServerSelectionTimeoutError) as err:
        return {
            "status": "disconnected",
            "database": DB_NAME,
            "error": str(err)
        }
