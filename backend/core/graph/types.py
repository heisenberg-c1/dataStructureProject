"""平面路网图模型：顶点坐标、无向边表、邻接表（含边 id，便于挂交通属性）。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
from numpy.typing import NDArray

Adjacency = list[list[tuple[int, int]]]
"""邻接表：adj[v] = [(neighbor, edge_id), ...]"""

CongestionLevel = Literal["green", "yellow", "red"]


@dataclass(frozen=True, slots=True)
class EdgeTrafficState:
    """单条边的交通状态快照。"""

    edge_id: int
    capacity_v: float
    vehicle_count_n: float
    load_ratio: float
    dynamic_travel_time: float
    congestion_level: CongestionLevel


@dataclass(frozen=True, slots=True)
class RoadGraph:
    """无向路网；顶点 id 为 0..N-1，边 id 为 0..E-1。"""

    points: NDArray[np.float64]  # shape (N, 2)
    edges: NDArray[np.int64]  # shape (E, 2), 每行 [u, v] 且 u < v
    edge_lengths: NDArray[np.float64]  # shape (E,)

    @property
    def n_vertices(self) -> int:
        return int(self.points.shape[0])

    @property
    def n_edges(self) -> int:
        return int(self.edges.shape[0])


def build_adjacency(graph: RoadGraph) -> Adjacency:
    """构建邻接表；每条无向边在两端各出现一次，并携带全局 edge_id。"""
    n = graph.n_vertices
    adj: Adjacency = [[] for _ in range(n)]
    for eid, (u, v) in enumerate(graph.edges):
        w = float(graph.edge_lengths[eid])
        if w <= 0:
            raise ValueError(f"edge {eid} ({u},{v}) has non-positive length")
        adj[int(u)].append((int(v), eid))
        adj[int(v)].append((int(u), eid))
    return adj
