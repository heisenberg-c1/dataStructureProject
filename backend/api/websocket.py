"""WebSocket traffic stream endpoints."""

from __future__ import annotations

import asyncio
from contextlib import suppress
from dataclasses import dataclass
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.graph_engine import GraphEngine

router = APIRouter(tags=["traffic-ws"])


def _get_engine(websocket: WebSocket) -> GraphEngine | None:
	engine = getattr(websocket.app.state, "graph_engine", None)
	if isinstance(engine, GraphEngine):
		return engine
	return None


@dataclass(slots=True)
class _TrafficWsSessionConfig:
	push_interval_seconds: float


def _safe_float(value: Any, default: float) -> float:
	try:
		parsed = float(value)
	except (TypeError, ValueError):
		return default
	if parsed <= 0:
		return default
	return parsed


async def _receive_client_messages(
	websocket: WebSocket,
	stop_event: asyncio.Event,
	config: _TrafficWsSessionConfig,
) -> None:
	try:
		while not stop_event.is_set():
			payload = await websocket.receive_json()
			if not isinstance(payload, dict):
				continue

			message_type = payload.get("type")
			if message_type == "ping":
				await websocket.send_json({"type": "pong", "timestamp": payload.get("timestamp")})
				continue

			if message_type == "subscribe":
				options = payload.get("options")
				if isinstance(options, dict):
					throttle_ms = _safe_float(options.get("throttle_ms"), config.push_interval_seconds * 1000)
					config.push_interval_seconds = max(0.2, throttle_ms / 1000.0)
				await websocket.send_json(
					{
						"type": "subscribed",
						"channel": "traffic",
						"interval_ms": int(config.push_interval_seconds * 1000),
					}
				)
				continue

			if message_type == "unsubscribe":
				stop_event.set()
				await websocket.send_json({"type": "unsubscribed", "channel": "traffic"})
				return
	except WebSocketDisconnect:
		stop_event.set()


@router.websocket("/ws/traffic")
async def traffic_ws(websocket: WebSocket) -> None:
	"""Push traffic snapshots over websocket for real-time updates."""
	engine = _get_engine(websocket)
	await websocket.accept()
	if engine is None:
		await websocket.send_json(
			{
				"type": "error",
				"code": 503,
				"message": "Graph engine is not initialized",
			}
		)
		await websocket.close(code=1011)
		return

	config = _TrafficWsSessionConfig(push_interval_seconds=max(0.2, engine.traffic_tick_interval_seconds()))
	stop_event = asyncio.Event()
	sequence = 0

	receiver_task = asyncio.create_task(_receive_client_messages(websocket, stop_event, config))
	try:
		await websocket.send_json(
			{
				"type": "hello",
				"channel": "traffic",
				"interval_ms": int(config.push_interval_seconds * 1000),
			}
		)
		while not stop_event.is_set():
			sequence += 1
			await websocket.send_json(
				{
					"type": "traffic_state",
					"channel": "traffic",
					"seq": sequence,
					"data": engine.get_traffic_state(),
				}
			)
			try:
				await asyncio.wait_for(stop_event.wait(), timeout=config.push_interval_seconds)
			except TimeoutError:
				continue
	except WebSocketDisconnect:
		stop_event.set()
	except RuntimeError:
		stop_event.set()
	finally:
		stop_event.set()
		receiver_task.cancel()
		with suppress(asyncio.CancelledError, WebSocketDisconnect):
			await receiver_task
