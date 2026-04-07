import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { getViewZoomMax, useGraphStore } from "@/store/graphStore";

export function GraphControls() {
  const [x, setX] = useState("0.50");
  const [y, setY] = useState("0.50");
  const [k, setK] = useState("100");

  const meta = useGraphStore((state) => state.meta);
  const graph = useGraphStore((state) => state.graph);
  const path = useGraphStore((state) => state.path);
  const selection = useGraphStore((state) => state.selection);
  const network = useGraphStore((state) => state.network);
  const vertices = useGraphStore((state) => state.graph.vertices);
  const cluster = useGraphStore((state) => state.graph.cluster);
  const view = useGraphStore((state) => state.view);
  const zoomMax = getViewZoomMax();

  const selectedVertex = useMemo(() => {
    const selectedVertexId =
      selection.phase === "pickedAB"
        ? selection.targetVertexId ?? selection.sourceVertexId
        : selection.sourceVertexId;

    return vertices.find((vertex) => vertex.id === selectedVertexId) ?? null;
  }, [selection.phase, selection.sourceVertexId, selection.targetVertexId, vertices]);

  useEffect(() => {
    if (!selectedVertex) {
      return;
    }

    setX(selectedVertex.x.toFixed(4));
    setY(selectedVertex.y.toFixed(4));
  }, [selectedVertex]);

  const loadMeta = useGraphStore((state) => state.loadMeta);
  const loadNearby = useGraphStore((state) => state.loadNearby);
  const clearSelection = useGraphStore((state) => state.clearSelection);

  const onLoad = async (event: FormEvent) => {
    event.preventDefault();
    const xx = Number.parseFloat(x);
    const yy = Number.parseFloat(y);
    const kk = Number.parseInt(k, 10);

    if (!Number.isFinite(xx) || !Number.isFinite(yy) || !Number.isFinite(kk)) {
      return;
    }

    await loadMeta();
    await loadNearby({ x: xx, y: yy, k: kk, zoom: view.zoom });
  };

  return (
    <aside className="graph-controls">
      <h1>M4 Graph Demo</h1>
      <p className="subtitle">手动加载，缩放触发聚合，选 A/B 显示路径高亮</p>

      <form className="control-form" onSubmit={onLoad}>
        <label>
          x
          <input value={x} onChange={(event) => setX(event.target.value)} />
        </label>
        <label>
          y
          <input value={y} onChange={(event) => setY(event.target.value)} />
        </label>
        <label>
          k
          <input value={k} onChange={(event) => setK(event.target.value)} />
        </label>
        <button disabled={network.loadingNearby || network.loadingMeta} type="submit">
          {network.loadingNearby || network.loadingMeta ? "加载中..." : "加载附近点边"}
        </button>
      </form>

      <button className="secondary" onClick={clearSelection} type="button">
        清空选择/路径
      </button>

      <section className="status-block">
        <h2>状态</h2>
        <ul>
          <li>phase: {selection.phase}</li>
          <li>A: {selection.sourceVertexId ?? "-"}</li>
          <li>B: {selection.targetVertexId ?? "-"}</li>
          <li>active point: {selectedVertex ? `${selectedVertex.x.toFixed(4)}, ${selectedVertex.y.toFixed(4)}` : "-"}</li>
          <li>vertices: {graph.vertices.length}</li>
          <li>zoom: {view.zoom.toFixed(1)}</li>
          <li>zoom max: {zoomMax.toFixed(0)}</li>
          <li>clustered: {cluster.clustered ? "yes" : "no"}</li>
          <li>cluster mode: {cluster.mode}</li>
          <li>raw/display: {cluster.rawVertexCount}/{cluster.displayVertexCount}</li>
          <li>edges: {graph.edges.length}</li>
          <li>raw/display edges: {cluster.rawEdgeCount}/{cluster.displayEdgeCount}</li>
          <li>merged edges: {cluster.mergedEdgeCount}</li>
          <li>path edges: {path?.edgeIds.length ?? 0}</li>
          <li>path length: {path ? path.totalLength.toFixed(4) : "-"}</li>
        </ul>
      </section>

      <section className="status-block">
        <h2>图元信息</h2>
        <ul>
          <li>n_vertices: {meta?.n_vertices ?? "-"}</li>
          <li>n_edges: {meta?.n_edges ?? "-"}</li>
          <li>incident_edge_count: {graph.incidentEdgeCount}</li>
          <li>cluster threshold: {cluster.threshold?.toFixed(1) ?? "-"}</li>
          <li>cluster leaves: {cluster.leafCount ?? "-"}</li>
        </ul>
      </section>

      {network.loadingPath ? <p className="hint">正在计算最短路...</p> : null}
      {network.error ? <p className="error">{network.error}</p> : null}
      <p className="hint">交互: 点击点选 A/B, 第三次点击重置为新 A; 拖拽平移, 滚轮缩放。</p>
    </aside>
  );
}
