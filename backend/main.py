"""
M1 算法内核验收：随机点 → Delaunay 路网 → Dijkstra + KDTree 近邻与关联边。

运行（在 `backend` 目录下）：`python main.py`
"""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from services.graph_engine import GraphEngine


def main() -> None:
    n_vertices = 10_000
    engine = GraphEngine.from_random(n_vertices=n_vertices, seed=42)
    meta = engine.get_meta()
    print(f"Graph: {meta['n_vertices']} vertices, {meta['n_edges']} edges")

    src, dst = 0, meta["n_vertices"] - 1
    sp = engine.shortest_path_by_vertex_id(src, dst)
    path = sp["vertex_ids"]
    preview_len = 12
    preview = path[:preview_len]
    tail = " ..." if len(path) > preview_len else ""
    print(f"Shortest path: {src} -> {dst}, length={sp['total_length']:.6f}, steps={len(path)}")
    print(f"  vertex_ids (preview): {preview}{tail}")

    cx, cy = 0.37, 0.52
    nb = engine.nearby((cx, cy), k=100)
    print(
        f"KDTree query at ({cx},{cy}): k={len(nb['vertex_ids'])}, "
        f"incident_edges={nb['incident_edge_count']}"
    )
    if nb["edges"]:
        e0 = nb["edges"][0]
        print(
            f"  example edge: id={e0['id']} u={e0['u']} v={e0['v']} "
            f"length={e0['length']:.6f}"
        )


if __name__ == "__main__":
    main()
