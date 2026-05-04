"""Union-Find (Disjoint Set Union) with path compression and union by rank."""

from __future__ import annotations


class UnionFind:
    """增量维护无向图连通分量；仅支持加边，不支持删边。"""

    def __init__(self, n: int) -> None:
        if n < 0:
            raise ValueError("n must be non-negative")
        self._parent = list(range(n))
        self._rank = [0] * n
        self._component_count = n

    def find(self, x: int) -> int:
        """返回 x 所在分量的根（带路径压缩）。"""
        while self._parent[x] != x:
            self._parent[x] = self._parent[self._parent[x]]
            x = self._parent[x]
        return x

    def union(self, x: int, y: int) -> bool:
        """合并 x 和 y 所在的分量；若已在同一分量则返回 False。"""
        rx, ry = self.find(x), self.find(y)
        if rx == ry:
            return False
        if self._rank[rx] < self._rank[ry]:
            rx, ry = ry, rx
        self._parent[ry] = rx
        if self._rank[rx] == self._rank[ry]:
            self._rank[rx] += 1
        self._component_count -= 1
        return True

    @property
    def component_count(self) -> int:
        """当前连通分量数。"""
        return self._component_count

    def components(self) -> list[list[int]]:
        """按根分组，返回所有连通分量（每个分量内顶点无序）。"""
        groups: dict[int, list[int]] = {}
        for v in range(len(self._parent)):
            root = self.find(v)
            groups.setdefault(root, []).append(v)
        return list(groups.values())
