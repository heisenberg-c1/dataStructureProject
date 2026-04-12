"""
路网引擎门面：供 `main` 演示与后续 FastAPI 路由复用。
预留 M2 查询参数（如 zoom）占位，默认 None。
"""

from __future__ import annotations

from dataclasses import dataclass, field
import math
from typing import Any, Optional

import numpy as np
from numpy.typing import NDArray
from scipy.spatial import cKDTree

from core.algorithms.dijkstra import shortest_path
from core.graph import RoadGraph, build_adjacency, build_road_graph_from_points
from core.simulator import TrafficConfig, TrafficSimulator
from core.spatial.kdtree import build_point_tree, edges_incident_to_vertices, query_nearest_k


CLUSTER_ZOOM_THRESHOLD_BASE = 1000.0
CLUSTER_MAX_THRESHOLD_SCALE = 4.0
CLUSTER_MIN_LEAF_POINTS = 6
CLUSTER_MAX_DEPTH = 9
CLUSTER_MIN_DISPLAY_POINTS = 3
CLUSTER_ZOOM_BUCKET_BASE = 1.18


def random_planar_points(n: int, seed: int = 42) -> NDArray[np.float64]:
    rng = np.random.default_rng(seed)
    return rng.random((n, 2), dtype=np.float64)

def _build_edge_lookup(graph: RoadGraph) -> dict[tuple[int, int], int]:
    m: dict[tuple[int, int], int] = {}
    for eid, (u, v) in enumerate(graph.edges):
        m[(int(u), int(v))] = int(eid)
    return m


def _path_edge_ids(path: list[int], edge_lookup: dict[tuple[int, int], int]) -> list[int]:
    if len(path) < 2:
        return []
    out: list[int] = []
    for i in range(len(path) - 1):
        a, b = path[i], path[i + 1]
        u, v = (a, b) if a < b else (b, a)
        eid = edge_lookup.get((u, v))
        if eid is None:
            raise ValueError(f"path edge ({u}, {v}) is not found in graph")
        out.append(eid)
    return out


def _sum_edge_lengths(graph: RoadGraph, edge_ids: list[int]) -> float:
    if not edge_ids:
        return 0.0
    idx = np.asarray(edge_ids, dtype=np.int64)
    return float(np.sum(graph.edge_lengths[idx]))


def _cluster_threshold_for_k(k: int) -> float:
    scale = math.sqrt(max(1, k) / 100.0)
    scaled = max(1.0, min(CLUSTER_MAX_THRESHOLD_SCALE, scale))
    return CLUSTER_ZOOM_THRESHOLD_BASE * scaled


def _cluster_target_display_count(raw_count: int, *, zoom: float, threshold: float) -> int:
    ratio = max(0.0, min(1.0, zoom / max(threshold, 1.0)))
    curved = ratio * ratio
    target = CLUSTER_MIN_DISPLAY_POINTS + (raw_count - CLUSTER_MIN_DISPLAY_POINTS) * curved
    return max(CLUSTER_MIN_DISPLAY_POINTS, min(raw_count, int(round(target))))


def _zoom_bucket(zoom: float) -> int:
    if zoom <= 1.0:
        return 0
    return int(math.floor(math.log(zoom) / math.log(CLUSTER_ZOOM_BUCKET_BASE)))


def _quadtree_cluster_vertex_ids(
    points: NDArray[np.float64],
    vertex_ids: NDArray[np.int64],
    *,
    zoom: float,
    threshold: float,
    target_display_count: int | None = None,
) -> tuple[list[int], dict[int, int], float, int, int]:
    """基于四叉树自适应聚合，返回代表点与原始点到代表点映射。"""
    ids = [int(v) for v in vertex_ids]
    if not ids:
        return [], {}, 0.0, 0, CLUSTER_MIN_LEAF_POINTS

    if target_display_count is None:
        target_display_count = _cluster_target_display_count(
            len(ids),
            zoom=zoom,
            threshold=threshold,
        )
    safe_target = max(1, min(len(ids), target_display_count))
    leaf_capacity = max(CLUSTER_MIN_LEAF_POINTS, int(math.ceil(len(ids) / safe_target)))

    xs = points[vertex_ids, 0]
    ys = points[vertex_ids, 1]
    min_x = float(xs.min())
    max_x = float(xs.max())
    min_y = float(ys.min())
    max_y = float(ys.max())

    # 避免退化边界导致递归无法继续分裂。
    eps = 1e-9
    if max_x - min_x < eps:
        max_x = min_x + eps
    if max_y - min_y < eps:
        max_y = min_y + eps

    leaves: list[tuple[list[int], tuple[float, float, float, float]]] = []

    def _split(node_ids: list[int], bounds: tuple[float, float, float, float], depth: int) -> None:
        x0, y0, x1, y1 = bounds
        if len(node_ids) <= leaf_capacity or depth >= CLUSTER_MAX_DEPTH:
            leaves.append((node_ids, bounds))
            return

        width = x1 - x0
        height = y1 - y0
        if width <= eps or height <= eps:
            leaves.append((node_ids, bounds))
            return

        mx = (x0 + x1) * 0.5
        my = (y0 + y1) * 0.5

        quadrants: list[tuple[list[int], tuple[float, float, float, float]]] = [
            ([], (x0, y0, mx, my)),
            ([], (mx, y0, x1, my)),
            ([], (x0, my, mx, y1)),
            ([], (mx, my, x1, y1)),
        ]

        for vid in node_ids:
            px = float(points[vid, 0])
            py = float(points[vid, 1])
            if py < my:
                idx = 0 if px < mx else 1
            else:
                idx = 2 if px < mx else 3
            quadrants[idx][0].append(vid)

        non_empty = [(q_ids, q_bounds) for q_ids, q_bounds in quadrants if q_ids]
        if len(non_empty) <= 1:
            leaves.append((node_ids, bounds))
            return

        for q_ids, q_bounds in non_empty:
            _split(q_ids, q_bounds, depth + 1)

    _split(ids, (min_x, min_y, max_x, max_y), 0)

    representatives: list[int] = []
    vertex_to_rep: dict[int, int] = {}
    leaf_spans: list[float] = []

    for leaf_ids, bounds in leaves:
        x0, y0, x1, y1 = bounds
        cx = (x0 + x1) * 0.5
        cy = (y0 + y1) * 0.5

        best_vid = leaf_ids[0]
        best_dist2 = float("inf")
        for vid in leaf_ids:
            dx = float(points[vid, 0]) - cx
            dy = float(points[vid, 1]) - cy
            d2 = dx * dx + dy * dy
            if d2 < best_dist2:
                best_dist2 = d2
                best_vid = vid

        representatives.append(best_vid)
        for vid in leaf_ids:
            vertex_to_rep[vid] = best_vid

        leaf_spans.append(max(x1 - x0, y1 - y0))

    avg_span = float(sum(leaf_spans) / len(leaf_spans)) if leaf_spans else 0.0
    return representatives, vertex_to_rep, avg_span, len(leaves), leaf_capacity


@dataclass
class GraphEngine:
    graph: RoadGraph
    adj: list[list[tuple[int, int]]]
    _tree: cKDTree
    traffic_simulator: TrafficSimulator | None = None
    _edge_lookup_cache: dict[tuple[int, int], int] = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        if not self._edge_lookup_cache:
            self._edge_lookup_cache = _build_edge_lookup(self.graph)

    @classmethod
    def from_random(
        cls,
        n_vertices: int = 10_000,
        seed: int = 42,
        *,
        traffic_config: TrafficConfig | None = None,
    ) -> GraphEngine:
        pts = random_planar_points(n_vertices, seed=seed)
        g = build_road_graph_from_points(pts)
        adj = build_adjacency(g)
        tree = build_point_tree(g.points)
        simulator = TrafficSimulator(g, seed=seed + 17, config=traffic_config)
        return cls(graph=g, adj=adj, _tree=tree, traffic_simulator=simulator)

    def traffic_tick_interval_seconds(self) -> float:
        if self.traffic_simulator is None:
            return 0.5
        return float(self.traffic_simulator.config.tick_interval_seconds)

    def tick_traffic(self, dt: float | None = None) -> None:
        if self.traffic_simulator is None:
            return
        if dt is None:
            dt = self.traffic_simulator.config.tick_interval_seconds
        self.traffic_simulator.tick(float(dt))

    def get_traffic_state(self, edge_ids: Optional[list[int]] = None) -> dict[str, Any]:
        if self.traffic_simulator is None:
            raise RuntimeError("Traffic simulator is not initialized")
        states = self.traffic_simulator.snapshot(edge_ids=edge_ids)
        edges_out = [
            {
                "id": int(s.edge_id),
                "capacity_v": float(s.capacity_v),
                "vehicle_count_n": float(s.vehicle_count_n),
                "load_ratio": float(s.load_ratio),
                "dynamic_travel_time": float(s.dynamic_travel_time),
                "congestion_level": s.congestion_level,
            }
            for s in states
        ]
        return {
            "timestamp": float(self.traffic_simulator.timestamp),
            "edges": edges_out,
        }

    def get_traffic_stats(self) -> dict[str, float]:
        if self.traffic_simulator is None:
            raise RuntimeError("Traffic simulator is not initialized")
        return self.traffic_simulator.congestion_stats()

    def get_meta(self) -> dict[str, Any]:
        g = self.graph
        xs = g.points[:, 0]
        ys = g.points[:, 1]
        return {
            "n_vertices": g.n_vertices,
            "n_edges": g.n_edges,
            "bounds": {
                "min_x": float(xs.min()),
                "max_x": float(xs.max()),
                "min_y": float(ys.min()),
                "max_y": float(ys.max()),
            },
        }

    def shortest_path_by_vertex_id(
        self,
        source: int,
        target: int,
        *,
        include_edges: bool = True,
        use_traffic: bool = False,
    ) -> dict[str, Any]:
        if use_traffic:
            if self.traffic_simulator is None:
                raise RuntimeError("Traffic simulator is not initialized")
            edge_weights = self.traffic_simulator.dynamic_edge_weights()
            path, total_travel_time = shortest_path(self.adj, edge_weights, source, target)
        else:
            path, total_travel_time = shortest_path(self.adj, self.graph.edge_lengths, source, target)

        edge_ids = _path_edge_ids(path, self._edge_lookup_cache) if path else []
        total_length = _sum_edge_lengths(self.graph, edge_ids)
        out: dict[str, Any] = {
            "vertex_ids": path,
            "total_length": float(total_length if use_traffic else total_travel_time),
        }
        if include_edges and path:
            out["edge_ids"] = edge_ids
        if use_traffic:
            out["total_travel_time"] = float(total_travel_time)
        return out

    def nearby(
        self,
        center_xy: tuple[float, float],
        k: int = 100,
        *,
        zoom: Optional[float] = None,
    ) -> dict[str, Any]:
        """最近 k 个顶点及其关联边；低 zoom 启用代表点聚合（M4/F2）。"""
        g = self.graph
        raw_idx = query_nearest_k(self._tree, center_xy, k=k, n_vertices=g.n_vertices)
        raw_idx_list = [int(i) for i in raw_idx]
        raw_idx_set = set(raw_idx_list)

        cluster_threshold = _cluster_threshold_for_k(k)
        should_cluster = zoom is not None and zoom < cluster_threshold
        idx_list = raw_idx_list
        vertex_to_rep: dict[int, int] = {vid: vid for vid in raw_idx_list}
        cluster_cell_size: float | None = None
        cluster_leaf_count: int | None = None
        cluster_leaf_capacity: int | None = None
        cluster_target_display_count: int | None = None
        cluster_zoom_bucket: int | None = _zoom_bucket(float(zoom)) if zoom is not None else None
        cluster_mode = "none"

        if should_cluster:
            cluster_target_display_count = _cluster_target_display_count(
                len(raw_idx_list),
                zoom=float(zoom),
                threshold=cluster_threshold,
            )
            reps, vertex_to_rep, cluster_cell_size, cluster_leaf_count, cluster_leaf_capacity = _quadtree_cluster_vertex_ids(
                g.points,
                raw_idx,
                zoom=float(zoom),
                threshold=cluster_threshold,
                target_display_count=cluster_target_display_count,
            )
            reps.sort(key=lambda vid: (g.points[vid, 0] - center_xy[0]) ** 2 + (g.points[vid, 1] - center_xy[1]) ** 2)
            idx_list = reps
            cluster_mode = "quadtree"

        idx = np.asarray(idx_list, dtype=np.int64)

        source_idx = raw_idx if should_cluster else idx
        candidate_eids = edges_incident_to_vertices(self.adj, source_idx)
        filtered_eids: list[int] = []
        for eid in candidate_eids:
            u = int(g.edges[eid, 0])
            v = int(g.edges[eid, 1])
            if u in raw_idx_set and v in raw_idx_set:
                filtered_eids.append(int(eid))

        raw_edge_count = len(filtered_eids)
        merged_edge_count = 0
        edges_out = [
            {
                "id": int(eid),
                "u": int(g.edges[eid, 0]),
                "v": int(g.edges[eid, 1]),
                "length": float(g.edge_lengths[eid]),
                "aggregated_count": 1,
                "x1": float(g.points[int(g.edges[eid, 0]), 0]),
                "y1": float(g.points[int(g.edges[eid, 0]), 1]),
                "x2": float(g.points[int(g.edges[eid, 1]), 0]),
                "y2": float(g.points[int(g.edges[eid, 1]), 1]),
            }
            for eid in filtered_eids
        ]

        verts = [{"id": int(i), "x": float(g.points[i, 0]), "y": float(g.points[i, 1])} for i in idx]
        return {
            "vertex_ids": idx_list,
            "vertices": verts,
            "edges": edges_out,
            "incident_edge_count": len(edges_out),
            "clustered": should_cluster,
            "cluster_mode": cluster_mode,
            "raw_vertex_count": int(raw_idx.shape[0]),
            "display_vertex_count": len(idx_list),
            "raw_edge_count": raw_edge_count,
            "display_edge_count": len(edges_out),
            "merged_edge_count": merged_edge_count,
            "cluster_threshold": cluster_threshold,
            "zoom": float(zoom) if zoom is not None else None,
            "cluster_cell_size": cluster_cell_size,
            "cluster_leaf_count": cluster_leaf_count,
            "cluster_leaf_capacity": cluster_leaf_capacity,
            "cluster_target_display_count": cluster_target_display_count,
            "cluster_zoom_bucket": cluster_zoom_bucket,
        }
