"""WebSocket placeholders for future traffic push updates."""

from __future__ import annotations

from fastapi import APIRouter, WebSocket

router = APIRouter(tags=["traffic-ws"])


@router.websocket("/ws/traffic")
async def traffic_ws(websocket: WebSocket) -> None:
	"""M5 placeholder websocket endpoint.

	Current MVP uses polling, so this endpoint only returns a placeholder payload.
	"""
	await websocket.accept()
	await websocket.send_json(
		{
			"type": "not_implemented",
			"detail": "WebSocket traffic stream is reserved for M5.",
		}
	)
	await websocket.close(code=1000)
