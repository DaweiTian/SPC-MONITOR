import asyncio
import json
from datetime import datetime
from typing import Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["WebSocket"])

websocket_clients: Set[WebSocket] = set()

async def broadcast_data(data: dict):
    if not websocket_clients:
        return
    message = json.dumps(data, ensure_ascii=False)
    disconnected = set()
    for client in websocket_clients:
        try:
            await client.send_text(message)
        except Exception:
            disconnected.add(client)
    websocket_clients.difference_update(disconnected)

async def broadcast_typed(msg_type: str, data: dict):
    message = json.dumps({"type": msg_type, "data": data, "timestamp": datetime.now().isoformat()}, ensure_ascii=False)
    await broadcast_data(message)

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    websocket_clients.add(websocket)
    try:
        await websocket.send_json({
            'type': 'connected',
            'message': '已连接到实时数据推送',
            'timestamp': datetime.now().isoformat(),
        })
        
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                if data == 'ping':
                    await websocket.send_json({'type': 'pong'})
            except asyncio.TimeoutError:
                try:
                    await websocket.send_json({'type': 'heartbeat'})
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    finally:
        websocket_clients.discard(websocket)
