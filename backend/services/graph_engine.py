"""
路网引擎门面：供 `main` 演示与后续 FastAPI 路由复用。
预留 M2 查询参数（如 zoom）占位，默认 None。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import numpy as np
from numpy.typing import NDArray
from scipy.spatial import cKDTree

from core.algorithms.dijkstra import shortest_path
from core.graph import RoadGraph, build_adjacency, build_road_graph_from_points
from core.spatial.kdtree import build_point_tree, edges_incident_to_vertices, query_nearest_k


def random_planar_points(n: int, seed: int = 42) -> NDArray[np.float64]:
    rng = np.random.default_rng(seed)
    return rng.random((n, 2), dtype=np.float64)

##建立一个“反向索引”，用于快速查找边 id,但是存在性能问题 TODO：后续用哈希表存储进行优化
def _edge_lookup(graph: RoadGraph) -> dict[tuple[int, int], int]:
    m: dict[tuple[int, int], int] = {}
    for eid, (u, v) in enumerate(graph.edges):
        m[(int(u), int(v))] = int(eid)
    return m


def _path_edge_ids(graph: RoadGraph, path: list[int]) -> list[int]:
    if len(path) < 2:
        return []
    lu = _edge_lookup(graph)
    out: list[int] = []
    for i in range(len(path) - 1):
        a, b = path[i], path[i + 1]
        u, v = (a, b) if a < b else (b, a)
        out.append(lu[(u, v)])
    return out


@dataclass
class GraphEngine:
    graph: RoadGraph
    adj: list[list[tuple[int, int]]]
    _tree: cKDTree

    @classmethod
    def from_random(cls, n_vertices: int = 10_000, seed: int = 42) -> GraphEngine:
        pts = random_planar_points(n_vertices, seed=seed)
        g = build_road_graph_from_points(pts)
        adj = build_adjacency(g)
        tree = build_point_tree(g.points)
        return cls(graph=g, adj=adj, _tree=tree)

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
    ) -> dict[str, Any]:
        path, length = shortest_path(self.adj, self.graph.edge_lengths, source, target)
        out: dict[str, Any] = {
            "vertex_ids": path,
            "total_length": float(length),
        }
        if include_edges and path:
            out["edge_ids"] = _path_edge_ids(self.graph, path)
        return out

    def nearby(
        self,
        center_xy: tuple[float, float],
        k: int = 100,
        *,
        zoom: Optional[float] = None,
    ) -> dict[str, Any]:
        """最近 k 个顶点及其关联边（F1）；zoom 预留供 M4 聚合。"""
        _ = zoom
        g = self.graph
        idx = query_nearest_k(self._tree, center_xy, k=k, n_vertices=g.n_vertices)
        eids = edges_incident_to_vertices(self.adj, idx)
        verts = [{"id": int(i), "x": float(g.points[i, 0]), "y": float(g.points[i, 1])} for i in idx]
        edges_out = [
            {
                "id": int(eid),
                "u": int(g.edges[eid, 0]),
                "v": int(g.edges[eid, 1]),
                "length": float(g.edge_lengths[eid]),
            }
            for eid in eids
        ]
        return {
            "vertex_ids": [int(x) for x in idx],
            "vertices": verts,
            "edges": edges_out,
            "incident_edge_count": len(eids),
        }
