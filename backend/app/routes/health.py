from fastapi import APIRouter
from datetime import datetime
from app.database import check_db_connection

router = APIRouter(prefix="/api", tags=["Health"])

@router.get("/health")
def get_health_status():
    """Health check endpoint: returns application and database connection status."""
    db_status = check_db_connection()
    return {
        "status": "healthy" if db_status["status"] == "connected" else "degraded",
        "app": "Sushrutha Grid API",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "database": db_status
    }
