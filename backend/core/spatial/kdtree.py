"""平面最近邻查询与「顶点集合关联边」聚合。"""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray
from scipy.spatial import cKDTree

from core.graph.types import Adjacency


def build_point_tree(points: NDArray[np.float64]) -> cKDTree:
    return cKDTree(np.asarray(points, dtype=np.float64))


def query_nearest_k(
    tree: cKDTree,
    xy: tuple[float, float] | NDArray[np.float64],
    k: int,
    n_vertices: int,
) -> NDArray[np.int64]:
    """返回距离查询点最近的 k 个顶点下标（k 会截断为 n_vertices）。"""
    kk = min(int(k), int(n_vertices))
    if kk < 1:
        return np.array([], dtype=np.int64)
    q = np.asarray(xy, dtype=np.float64).reshape(1, 2)
    distances, indices = tree.query(q, k=kk)
    if kk == 1:
        return np.array([int(indices)], dtype=np.int64)
    return np.asarray(indices[0], dtype=np.int64)


def edges_incident_to_vertices(
    adj: Adjacency,
    vertex_indices: NDArray[np.int64] | list[int],
) -> list[int]:
    """
    至少有一个端点落在给定顶点集合中的无向边 edge_id（去重、升序）。
    通过邻接表遍历顶点集合，避免全边扫描。
    """
    want = {int(x) for x in np.asarray(vertex_indices).ravel()}
    seen: set[int] = set()
    out: list[int] = []
    for v in want:
        for _nb, eid in adj[v]:
            eid = int(eid)
            if eid not in seen:
                seen.add(eid)
                out.append(eid)
    out.sort()
    return out
