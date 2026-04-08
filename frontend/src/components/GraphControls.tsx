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
  const staticPath = useGraphStore((state) => state.staticPath);
  const trafficPath = useGraphStore((state) => state.trafficPath);
  const pathMode = useGraphStore((state) => state.pathMode);
  const trafficTimestamp = useGraphStore((state) => state.trafficTimestamp);
  const trafficPollingEnabled = useGraphStore((state) => state.trafficPollingEnabled);
  const trafficTransportMode = useGraphStore((state) => state.trafficTransportMode);
  const trafficConnectionState = useGraphStore((state) => state.trafficConnectionState);
  const selection = useGraphStore((state) => state.selection);
  const network = useGraphStore((state) => state.network);
  const vertices = useGraphStore((state) => state.graph.vertices);
  const cluster = useGraphStore((state) => state.graph.cluster);
  const viewZoom = useGraphStore((state) => state.view.zoom);
  const zoomMax = getViewZoomMax();

  const trafficSummary = useMemo(() => {
    let green = 0;
    let yellow = 0;
    let red = 0;
    for (const edge of graph.edges) {
      if (edge.congestion_level === "green") {
        green += 1;
      } else if (edge.congestion_level === "yellow") {
        yellow += 1;
      } else if (edge.congestion_level === "red") {
        red += 1;
      }
    }
    return { green, yellow, red };
  }, [graph.edges]);

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
  const fetchTrafficState = useGraphStore((state) => state.fetchTrafficState);
  const setPathMode = useGraphStore((state) => state.setPathMode);
  const setTrafficPollingEnabled = useGraphStore((state) => state.setTrafficPollingEnabled);
  const connectTrafficStream = useGraphStore((state) => state.connectTrafficStream);
  const disconnectTrafficStream = useGraphStore((state) => state.disconnectTrafficStream);
  const clearSelection = useGraphStore((state) => state.clearSelection);

  useEffect(() => {
    if (trafficPollingEnabled) {
      void connectTrafficStream();
    } else {
      disconnectTrafficStream();
    }

    return () => {
      disconnectTrafficStream();
    };
  }, [connectTrafficStream, disconnectTrafficStream, trafficPollingEnabled]);

  const onLoad = async (event: FormEvent) => {
    event.preventDefault();
    const xx = Number.parseFloat(x);
    const yy = Number.parseFloat(y);
    const kk = Number.parseInt(k, 10);

    if (!Number.isFinite(xx) || !Number.isFinite(yy) || !Number.isFinite(kk)) {
      return;
    }

    await loadMeta();
    await loadNearby({ x: xx, y: yy, k: kk, zoom: viewZoom });
    await fetchTrafficState();
  };

  return (
    <aside className="graph-controls">
      <h1>M5 Graph Demo</h1>
      <p className="subtitle">交通着色 + 静态/动态路径对比 + WebSocket 实时更新</p>

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
        <h2>路径模式</h2>
        <div className="mode-row">
          <button
            className={pathMode === "compare" ? "mode-btn active" : "mode-btn"}
            onClick={() => setPathMode("compare")}
            type="button"
          >
            对比
          </button>
          <button
            className={pathMode === "static" ? "mode-btn active" : "mode-btn"}
            onClick={() => setPathMode("static")}
            type="button"
          >
            静态
          </button>
          <button
            className={pathMode === "traffic" ? "mode-btn active" : "mode-btn"}
            onClick={() => setPathMode("traffic")}
            type="button"
          >
            动态
          </button>
        </div>
      </section>

      <section className="status-block">
        <h2>交通更新</h2>
        <div className="traffic-actions">
          <button disabled={network.loadingTraffic} onClick={() => void fetchTrafficState()} type="button">
            {network.loadingTraffic ? "刷新中..." : "刷新交通状态"}
          </button>
          <label className="polling-toggle">
            <input
              checked={trafficPollingEnabled}
              onChange={(event) => setTrafficPollingEnabled(event.target.checked)}
              type="checkbox"
            />
            自动实时更新(WS优先)
          </label>
        </div>
        <p className="hint">traffic timestamp: {trafficTimestamp ? trafficTimestamp.toFixed(2) : "-"}</p>
        <p className="hint">transport: {trafficTransportMode}</p>
        <p className="hint">connection: {trafficConnectionState}</p>
      </section>

      <section className="status-block">
        <h2>状态</h2>
        <ul>
          <li>path mode: {pathMode}</li>
          <li>phase: {selection.phase}</li>
          <li>A: {selection.sourceVertexId ?? "-"}</li>
          <li>B: {selection.targetVertexId ?? "-"}</li>
          <li>active point: {selectedVertex ? `${selectedVertex.x.toFixed(4)}, ${selectedVertex.y.toFixed(4)}` : "-"}</li>
          <li>vertices: {graph.vertices.length}</li>
          <li>zoom: {viewZoom.toFixed(1)}</li>
          <li>zoom max: {zoomMax.toFixed(0)}</li>
          <li>clustered: {cluster.clustered ? "yes" : "no"}</li>
          <li>cluster mode: {cluster.mode}</li>
          <li>raw/display: {cluster.rawVertexCount}/{cluster.displayVertexCount}</li>
          <li>edges: {graph.edges.length}</li>
          <li>raw/display edges: {cluster.rawEdgeCount}/{cluster.displayEdgeCount}</li>
          <li>merged edges: {cluster.mergedEdgeCount}</li>
          <li>current path edges: {path?.edgeIds.length ?? 0}</li>
          <li>static length: {staticPath ? staticPath.totalLength.toFixed(4) : "-"}</li>
          <li>traffic length: {trafficPath ? trafficPath.totalLength.toFixed(4) : "-"}</li>
          <li>traffic time: {trafficPath?.totalTravelTime != null ? trafficPath.totalTravelTime.toFixed(4) : "-"}</li>
          <li>green/yellow/red: {trafficSummary.green}/{trafficSummary.yellow}/{trafficSummary.red}</li>
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
