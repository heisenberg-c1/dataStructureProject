"""无向正权图上的 A* 最短路；当启发函数为 0 时退化为 Dijkstra。"""

from __future__ import annotations

import heapq

import numpy as np
from numpy.typing import NDArray

Adjacency = list[list[tuple[int, int]]]


def shortest_path(
    adj: Adjacency,
    edge_lengths: NDArray[np.float64],
    source: int,
    target: int,
    *,
    points: NDArray[np.float64] | None = None,
    heuristic_scale: float | None = None,
) -> tuple[list[int], float]:
    """
    返回从 source 到 target 的顶点序列（含端点）与路径总长。
    若不可达，返回 ([], inf)。

    参数 points + heuristic_scale 可启用 A* 启发函数：
    h(u) = heuristic_scale * euclidean(points[u], points[target])。
    当 points 为 None 或 heuristic_scale <= 0 时，启发函数为 0，
    算法等价于 Dijkstra。
    """
    n = len(adj)
    if source == target:
        return [source], 0.0
    if not (0 <= source < n and 0 <= target < n):
        raise ValueError("source/target out of range")

    if heuristic_scale is None:
        heuristic_scale = 1.0
    heuristic_scale = float(heuristic_scale)
    if heuristic_scale < 0:
        raise ValueError("heuristic_scale must be non-negative")

    heuristic = np.zeros(n, dtype=np.float64)
    if points is not None and heuristic_scale > 0:
        pts = np.asarray(points, dtype=np.float64)
        if pts.ndim != 2 or pts.shape[0] != n or pts.shape[1] != 2:
            raise ValueError("points must have shape (N, 2) and match adjacency size")
        tx = float(pts[target, 0])
        ty = float(pts[target, 1])
        dx = pts[:, 0] - tx
        dy = pts[:, 1] - ty
        heuristic = heuristic_scale * np.sqrt(dx * dx + dy * dy)

    dist = [float("inf")] * n
    dist[source] = 0.0
    parent = [-1] * n
    pq: list[tuple[float, int]] = [(float(heuristic[source]), source)]
    while pq:
        f, u = heapq.heappop(pq)
        if f > dist[u] + float(heuristic[u]):
            continue
        if u == target:
            break
        d = dist[u]
        for v, eid in adj[u]:
            w = float(edge_lengths[int(eid)])
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                parent[v] = u
                heapq.heappush(pq, (nd + float(heuristic[v]), v))

    if dist[target] == float("inf"):
        return [], float("inf")

    path: list[int] = []
    cur = target
    while cur != -1:
        path.append(cur)
        cur = parent[cur]
    path.reverse()
    return path, dist[target]
