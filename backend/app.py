"""FastAPI app entry for M2 APIs."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from contextlib import suppress
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router as graph_router
from api.websocket import router as ws_router
from services.graph_engine import GraphEngine


def create_app(n_vertices: int = 10_000, seed: int = 42) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = GraphEngine.from_random(n_vertices=n_vertices, seed=seed)
        app.state.graph_engine = engine

        stop_event = asyncio.Event()

        async def _traffic_tick_loop() -> None:
            while not stop_event.is_set():
                engine.tick_traffic()
                try:
                    await asyncio.wait_for(
                        stop_event.wait(),
                        timeout=engine.traffic_tick_interval_seconds(),
                    )
                except TimeoutError:
                    continue

        tick_task = asyncio.create_task(_traffic_tick_loop())
        try:
            yield
        finally:
            stop_event.set()
            tick_task.cancel()
            with suppress(asyncio.CancelledError):
                await tick_task

    app = FastAPI(
        title="Data Homework API",
        version="0.2.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(graph_router)
    app.include_router(ws_router)

    @app.get("/health", tags=["system"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
