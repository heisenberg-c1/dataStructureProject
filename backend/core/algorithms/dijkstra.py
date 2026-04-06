"""无向正权图上的 Dijkstra 最短路。"""

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
) -> tuple[list[int], float]:
    """
    返回从 source 到 target 的顶点序列（含端点）与路径总长。
    若不可达，返回 ([], inf)。
    """
    n = len(adj)
    if source == target:
        return [source], 0.0
    if not (0 <= source < n and 0 <= target < n):
        raise ValueError("source/target out of range")

    dist = [float("inf")] * n
    dist[source] = 0.0
    parent = [-1] * n
    pq: list[tuple[float, int]] = [(0.0, source)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        if u == target:
            break
        for v, eid in adj[u]:
            w = float(edge_lengths[int(eid)])
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                parent[v] = u
                heapq.heappush(pq, (nd, v))

    if dist[target] == float("inf"):
        return [], float("inf")

    path: list[int] = []
    cur = target
    while cur != -1:
        path.append(cur)
        cur = parent[cur]
    path.reverse()
    return path, dist[target]
