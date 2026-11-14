import asyncio
import json
from datetime import datetime
from typing import List, Dict, Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["WebSocket Real-Time Event Bus"])

_main_loop: Any = None

def set_main_loop(loop: Any):
    global _main_loop
    _main_loop = loop

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, event_type: str, data: Dict[str, Any]):
        message = {
            "event": event_type,
            "data": data,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
        payload = json.dumps(message)
        to_remove = []
        for connection in list(self.active_connections):
            try:
                await connection.send_text(payload)
            except Exception:
                to_remove.append(connection)
        for dead in to_remove:
            if dead in self.active_connections:
                self.active_connections.remove(dead)

manager = ConnectionManager()

def broadcast_event(event_type: str, data: Dict[str, Any]):
    """
    Thread-safe broadcaster for hospital events.
    Can be called synchronously from any route or background thread.
    """
    global _main_loop
    message = {
        "event": event_type,
        "data": data,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }
    payload = json.dumps(message)

    async def _broadcast_task():
        to_remove = []
        for connection in list(manager.active_connections):
            try:
                await connection.send_text(payload)
            except Exception:
                to_remove.append(connection)
        for dead in to_remove:
            if dead in manager.active_connections:
                manager.active_connections.remove(dead)

    if _main_loop and _main_loop.is_running():
        try:
            asyncio.run_coroutine_threadsafe(_broadcast_task(), _main_loop)
            return
        except Exception:
            pass

    try:
        running_loop = asyncio.get_running_loop()
        running_loop.create_task(_broadcast_task())
    except RuntimeError:
        pass


@router.websocket("/ws/hospital")
async def hospital_websocket_endpoint(websocket: WebSocket):
    """
    Native WebSocket channel for real-time hospital event coordination.
    Broadcasts token calls, consultation starts, queue updates, and prescription issuances.
    """
    await manager.connect(websocket)
    try:
        # Acknowledge connection
        await websocket.send_text(json.dumps({
            "event": "WS_CONNECTED",
            "data": {
                "message": "Connected to Sushrutha Real-Time Hospital Event Bus",
                "active_listeners": len(manager.active_connections)
            },
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }))
        while True:
            raw_text = await websocket.receive_text()
            try:
                payload = json.loads(raw_text)
                if payload.get("type") == "PING":
                    await websocket.send_text(json.dumps({
                        "event": "PONG",
                        "timestamp": datetime.utcnow().isoformat() + "Z"
                    }))
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
