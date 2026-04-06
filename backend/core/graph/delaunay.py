"""由平面点集经 Delaunay 三角剖分得到无向边，去重并保证连通。"""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray
from scipy.spatial import Delaunay, cKDTree

from .types import RoadGraph


def _edge_set_from_simplices(simplices: NDArray[np.int_]) -> set[tuple[int, int]]:
    edges: set[tuple[int, int]] = set()
    for a, b, c in simplices:
        for u, v in ((a, b), (b, c), (c, a)):
            u, v = int(u), int(v)
            if u > v:
                u, v = v, u
            edges.add((u, v))
    return edges

## TODO：每次循环都重新算 components，存在性能问题，后续优化成并查集
def _components_from_edges(n: int, edge_pairs: set[tuple[int, int]]) -> list[list[int]]:
    adj: list[list[int]] = [[] for _ in range(n)]
    for u, v in edge_pairs:
        adj[u].append(v)
        adj[v].append(u)
    visited = [False] * n
    comps: list[list[int]] = []
    for i in range(n):
        if visited[i]:
            continue
        stack = [i]
        visited[i] = True
        comp: list[int] = []
        while stack:
            x = stack.pop()
            comp.append(x)
            for y in adj[x]:
                if not visited[y]:
                    visited[y] = True
                    stack.append(y)
        comps.append(comp)
    return comps


def _ensure_connected(
    points: NDArray[np.float64],
    pairs: list[tuple[int, int]],
) -> list[tuple[int, int]]:
    """若边集不连通，在相距最近的两分量之间反复补边直至连通。"""
    n = int(points.shape[0])
    if n <= 1:
        return pairs

    edges: set[tuple[int, int]] = set(pairs)
    while True:
        comps = _components_from_edges(n, edges)
        if len(comps) <= 1:
            break
        A, B = comps[0], comps[1]
        pts_a = np.asarray(points[A], dtype=np.float64)
        pts_b = np.asarray(points[B], dtype=np.float64)
        ## TODO：每次循环都重新算 tree，存在性能问题，后续优化成缓存
        tree_b = cKDTree(pts_b)
        dists, idx_b = tree_b.query(pts_a, k=1)
        i = int(np.argmin(dists))
        u, v = A[i], B[int(idx_b[i])]
        if u > v:
            u, v = v, u
        edges.add((u, v))

    return sorted(edges)


def build_road_graph_from_points(points: NDArray[np.float64]) -> RoadGraph:
    """
    对二维点集做 Delaunay，提取无向边、去重，必要时补边保证连通，边权为欧氏长度。
    """
    pts = np.asarray(points, dtype=np.float64)
    if pts.ndim != 2 or pts.shape[1] != 2:
        raise ValueError("points must have shape (N, 2)")
    n = int(pts.shape[0])
    if n < 3:
        raise ValueError("need at least 3 points for Delaunay")

    tri = Delaunay(pts)
    raw = _edge_set_from_simplices(tri.simplices)
    pairs = sorted(raw)
    pairs = _ensure_connected(pts, pairs)

    edges_arr = np.asarray(pairs, dtype=np.int64)
    u = edges_arr[:, 0]
    v = edges_arr[:, 1]
    du = pts[u] - pts[v]
    lengths = np.sqrt(np.sum(du * du, axis=1))

    return RoadGraph(points=pts, edges=edges_arr, edge_lengths=lengths.astype(np.float64))
