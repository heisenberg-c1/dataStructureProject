"""由平面点集经 Delaunay 三角剖分得到无向边，去重并保证连通。"""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray
from scipy.spatial import Delaunay, cKDTree

from .types import RoadGraph
from .union_find import UnionFind


# 分量点数低于此阈值时用线性扫描代替 cKDTree，避免为微小分量构建树的开销
_SMALL_COMP_THRESHOLD = 50


def _edge_set_from_simplices(simplices: NDArray[np.int_]) -> set[tuple[int, int]]:
    edges: set[tuple[int, int]] = set()
    for a, b, c in simplices:
        for u, v in ((a, b), (b, c), (c, a)):
            u, v = int(u), int(v)
            if u > v:
                u, v = v, u
            edges.add((u, v))
    return edges


def _closest_pair_linear(
    pts_a: NDArray[np.float64],
    pts_b: NDArray[np.float64],
    ids_a: list[int],
    ids_b: list[int],
) -> tuple[int, int]:
    """线性扫描两分量间最近点对；用于微小分量，避免构建 cKDTree 开销。"""
    best_dist = float("inf")
    best_u, best_v = -1, -1
    for idx_a, pa in enumerate(pts_a):
        for idx_b, pb in enumerate(pts_b):
            d2 = (pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2
            if d2 < best_dist:
                best_dist = d2
                best_u, best_v = ids_a[idx_a], ids_b[idx_b]
    return best_u, best_v


def _closest_pair_tree(
    tree: cKDTree,
    pts_query: NDArray[np.float64],
    ids_query: list[int],
    ids_target: list[int],
) -> tuple[int, int]:
    """用已有 cKDTree 查最近点对。"""
    dists, idx_in_target = tree.query(pts_query, k=1)
    i = int(np.argmin(dists))
    idx_in_target_int = int(idx_in_target[i])
    return ids_query[i], ids_target[idx_in_target_int]


def _ensure_connected(
    points: NDArray[np.float64],
    pairs: list[tuple[int, int]],
) -> list[tuple[int, int]]:
    """若边集不连通，在相距最近的两分量之间反复补边直至连通。

    使用 Union-Find 增量维护连通分量，并以 cKDTree 缓存避免每轮重建树。
    """
    n = int(points.shape[0])
    if n <= 1:
        return pairs

    edges: set[tuple[int, int]] = set(pairs)

    # ---- 1. 用 Union-Find 初始化分量 ----
    uf = UnionFind(n)
    for u, v in edges:
        uf.union(u, v)

    if uf.component_count <= 1:
        return sorted(edges)

    # ---- 2. 为每个分量构建 cKDTree 缓存 ----
    # tree_cache: component_root -> cKDTree
    tree_cache: dict[int, cKDTree] = {}
    comps = uf.components()

    for comp in comps:
        root = uf.find(comp[0])
        pts_comp = np.asarray(points[comp], dtype=np.float64)
        tree_cache[root] = cKDTree(pts_comp)

    # ---- 3. 增量补边直至全连通 ----
    while uf.component_count > 1:
        # 重新获取分量列表（根已在上轮 union 后变化）
        comps = uf.components()
        if len(comps) <= 1:
            break

        A, B = comps[0], comps[1]
        root_a = uf.find(A[0])
        root_b = uf.find(B[0])

        pts_a = np.asarray(points[A], dtype=np.float64)
        pts_b = np.asarray(points[B], dtype=np.float64)

        # 选较小分量做查询端以降低 tree.query 开销
        if len(A) <= len(B):
            if len(B) < _SMALL_COMP_THRESHOLD:
                u, v = _closest_pair_linear(pts_a, pts_b, A, B)
            else:
                tree_b = tree_cache[root_b]
                u, v = _closest_pair_tree(tree_b, pts_a, A, B)
        else:
            if len(A) < _SMALL_COMP_THRESHOLD:
                u, v = _closest_pair_linear(pts_b, pts_a, B, A)
            else:
                tree_a = tree_cache[root_a]
                u, v = _closest_pair_tree(tree_a, pts_b, B, A)

        if u > v:
            u, v = v, u
        edges.add((u, v))
        uf.union(u, v)

        # ---- 更新缓存：移除旧分量树，为合并分量重建 ----
        tree_cache.pop(root_a, None)
        tree_cache.pop(root_b, None)

        new_root = uf.find(u)
        merged = A + B
        tree_cache[new_root] = cKDTree(np.asarray(points[merged], dtype=np.float64))

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
