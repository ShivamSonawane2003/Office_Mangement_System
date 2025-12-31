from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import List
from app.security import decode_token
from app.utils.logger import get_logger
import json
import asyncio

logger = get_logger(__name__)
router = APIRouter(prefix="/api")

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error sending WebSocket message: {e}")
                disconnected.append(connection)
        
        for conn in disconnected:
            self.disconnect(conn)

manager = ConnectionManager()

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    
    async def send_periodic_ping():
        """Send periodic ping to keep connection alive - no timeout, keep alive indefinitely"""
        while True:
            try:
                # Send ping every 30 seconds to keep connection alive
                # No timeout - connection stays alive as long as user is logged in
                await asyncio.sleep(30)
                if websocket in manager.active_connections:
                    try:
                        await websocket.send_json({"type": "ping"})
                    except Exception as e:
                        # Connection might be closed, break the loop
                        logger.debug(f"Error sending periodic ping, connection may be closed: {e}")
                        break
                else:
                    # Connection removed from active connections
                    break
            except asyncio.CancelledError:
                # Task was cancelled (normal shutdown)
                break
            except Exception as e:
                logger.debug(f"Error in ping loop: {e}")
                break
    
    # Start periodic ping task to keep connection alive indefinitely
    ping_task = asyncio.create_task(send_periodic_ping())
    
    try:
        # Keep connection alive indefinitely - no timeout
        while True:
            try:
                # Wait for messages with no timeout
                # This will keep the connection alive as long as the client is connected
                data = await websocket.receive_text()
                try:
                    message = json.loads(data)
                    if message.get("type") == "ping":
                        # Respond to client ping with pong
                        await websocket.send_json({"type": "pong"})
                    elif message.get("type") == "pong":
                        # Client responded to our ping - connection is alive
                        logger.debug("Received pong from client")
                except json.JSONDecodeError:
                    # Ignore invalid JSON
                    pass
            except WebSocketDisconnect:
                # Normal disconnect from client
                logger.info("WebSocket client disconnected normally")
                break
            except Exception as e:
                # Log error but don't break - try to keep connection alive
                logger.debug(f"WebSocket receive error (will retry): {e}")
                # Small delay before retrying
                await asyncio.sleep(1)
    except WebSocketDisconnect:
        # Normal disconnect
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.debug(f"WebSocket connection closed: {e}")
    finally:
        # Cancel ping task and clean up
        ping_task.cancel()
        try:
            await ping_task
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.debug(f"Error cancelling ping task: {e}")
        manager.disconnect(websocket)

def get_connection_manager():
    return manager
