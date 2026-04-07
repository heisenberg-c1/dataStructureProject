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


class TrafficEdgeStateDTO(BaseModel):
	id: int
	capacity_v: float
	vehicle_count_n: float
	load_ratio: float
	dynamic_travel_time: float
	congestion_level: str


class TrafficStateResponse(BaseModel):
	timestamp: float
	edges: list[TrafficEdgeStateDTO]


class TrafficShortestPathResponse(BaseModel):
	vertex_ids: list[int]
	edge_ids: list[int] = Field(default_factory=list)
	total_length: float
	total_travel_time: float


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


@router.get("/traffic/state", response_model=TrafficStateResponse)
async def get_traffic_state(request: Request) -> dict[str, Any]:
	"""M5/F4: traffic state for polling."""
	try:
		return _get_engine(request).get_traffic_state()
	except RuntimeError as exc:
		raise HTTPException(status_code=status.HTTP_424_FAILED_DEPENDENCY, detail=str(exc)) from exc


@router.post("/shortest-path/traffic", response_model=TrafficShortestPathResponse)
async def post_traffic_shortest_path(
	request: Request,
	payload: ShortestPathRequest,
) -> dict[str, Any]:
	"""M5/F5: shortest path by current dynamic travel time."""
	try:
		result = _get_engine(request).shortest_path_by_vertex_id(
			source=payload.source,
			target=payload.target,
			include_edges=True,
			use_traffic=True,
		)
	except ValueError as exc:
		raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
	except RuntimeError as exc:
		raise HTTPException(status_code=status.HTTP_424_FAILED_DEPENDENCY, detail=str(exc)) from exc

	if not result.get("vertex_ids"):
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="No path found between source and target",
		)
	return result
