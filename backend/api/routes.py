"""RESTful graph routes for M2 delivery."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from services.graph_engine import GraphEngine

router = APIRouter(prefix="/graph", tags=["graph"])


class Bounds(BaseModel):
	min_x: float
	max_x: float
	min_y: float
	max_y: float


class GraphMetaResponse(BaseModel):
	n_vertices: int
	n_edges: int
	bounds: Bounds


class VertexDTO(BaseModel):
	id: int
	x: float
	y: float


class EdgeDTO(BaseModel):
	id: int
	u: int
	v: int
	length: float
	aggregated_count: int | None = None
	x1: float | None = None
	y1: float | None = None
	x2: float | None = None
	y2: float | None = None


class NearbyResponse(BaseModel):
	vertex_ids: list[int]
	vertices: list[VertexDTO]
	edges: list[EdgeDTO]
	incident_edge_count: int
	clustered: bool = False
	cluster_mode: str = "none"
	raw_vertex_count: int | None = None
	display_vertex_count: int | None = None
	raw_edge_count: int | None = None
	display_edge_count: int | None = None
	merged_edge_count: int | None = None
	cluster_threshold: float | None = None
	zoom: float | None = None
	cluster_cell_size: float | None = None
	cluster_leaf_count: int | None = None


class ShortestPathRequest(BaseModel):
	source: int = Field(ge=0)
	target: int = Field(ge=0)


class ShortestPathResponse(BaseModel):
	vertex_ids: list[int]
	edge_ids: list[int] = Field(default_factory=list)
	total_length: float


class NotImplementedResponse(BaseModel):
	detail: str


def _get_engine(request: Request) -> GraphEngine:
	engine = getattr(request.app.state, "graph_engine", None)
	if engine is None:
		raise HTTPException(
			status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
			detail="Graph engine is not initialized",
		)
	return engine


@router.get("/meta", response_model=GraphMetaResponse)
async def get_graph_meta(request: Request) -> dict[str, Any]:
	"""M2: graph metadata without sending full graph."""
	return _get_engine(request).get_meta()


@router.get("/nearby", response_model=NearbyResponse)
async def get_nearby_graph(
	request: Request,
	x: float = Query(..., description="Query center x in world coordinates"),
	y: float = Query(..., description="Query center y in world coordinates"),
	k: int = Query(100, ge=1, le=10_000, description="Nearest vertex count"),
	zoom: float | None = Query(None, description="Current camera zoom; low zoom enables M4 grid clustering"),
) -> dict[str, Any]:
	"""M2/F1: nearest k vertices and their incident edges."""
	return _get_engine(request).nearby(center_xy=(x, y), k=k, zoom=zoom)


@router.post("/shortest-path", response_model=ShortestPathResponse)
async def post_shortest_path(
	request: Request,
	payload: ShortestPathRequest,
) -> dict[str, Any]:
	"""M2/F3: static shortest path by physical edge length."""
	try:
		result = _get_engine(request).shortest_path_by_vertex_id(
			source=payload.source,
			target=payload.target,
			include_edges=True,
		)
	except ValueError as exc:
		raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc

	if not result.get("vertex_ids"):
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="No path found between source and target",
		)
	return result


@router.get(
	"/traffic/state",
	response_model=NotImplementedResponse,
	status_code=status.HTTP_501_NOT_IMPLEMENTED,
)
async def get_traffic_state() -> dict[str, str]:
	"""M5 placeholder: traffic state for polling/WebSocket fallback."""
	return {"detail": "Not implemented yet. Reserved for M5 traffic simulation."}


@router.post(
	"/shortest-path/traffic",
	response_model=NotImplementedResponse,
	status_code=status.HTTP_501_NOT_IMPLEMENTED,
)
async def post_traffic_shortest_path() -> dict[str, str]:
	"""M5 placeholder: traffic-aware shortest path."""
	return {"detail": "Not implemented yet. Reserved for M5 traffic-aware routing."}
