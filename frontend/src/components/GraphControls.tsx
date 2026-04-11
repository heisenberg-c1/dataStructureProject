import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getViewZoomMax,
  NEARBY_K_MAX,
  NEARBY_K_MIN,
  REBUILD_VERTEX_MAX,
  REBUILD_VERTEX_MIN,
  useGraphStore,
} from "@/store/graphStore";

export function GraphControls() {
  const [x, setX] = useState("0.50");
  const [y, setY] = useState("0.50");
  const [k, setK] = useState("100");
  const [nVertices, setNVertices] = useState("10000");
  const autoSyncedSourceIdRef = useRef<number | null>(null);

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

  const loadMeta = useGraphStore((state) => state.loadMeta);
  const loadNearby = useGraphStore((state) => state.loadNearby);
  const fetchTrafficState = useGraphStore((state) => state.fetchTrafficState);
  const setPathMode = useGraphStore((state) => state.setPathMode);
  const setTrafficPollingEnabled = useGraphStore((state) => state.setTrafficPollingEnabled);
  const connectTrafficStream = useGraphStore((state) => state.connectTrafficStream);
  const disconnectTrafficStream = useGraphStore((state) => state.disconnectTrafficStream);
  const clearSelection = useGraphStore((state) => state.clearSelection);
  const rebuildGraph = useGraphStore((state) => state.rebuildGraph);

  const normalizeNearbyK = (value: number): number => {
    if (!Number.isFinite(value)) {
      return NEARBY_K_MIN;
    }
    return Math.max(NEARBY_K_MIN, Math.min(NEARBY_K_MAX, Math.trunc(value)));
  };

  useEffect(() => {
    if (meta?.n_vertices != null) {
      setNVertices(String(meta.n_vertices));
    }
  }, [meta?.n_vertices]);

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

  useEffect(() => {
    if (selection.phase === "idle") {
      autoSyncedSourceIdRef.current = null;
      return;
    }
    if (selection.phase !== "pickedA" || selection.sourceVertexId == null || selectedVertex == null) {
      return;
    }
    if (autoSyncedSourceIdRef.current === selection.sourceVertexId) {
      return;
    }

    autoSyncedSourceIdRef.current = selection.sourceVertexId;
    const normalizedK = normalizeNearbyK(Number.parseInt(k, 10));
    setX(selectedVertex.x.toFixed(4));
    setY(selectedVertex.y.toFixed(4));
    if (String(normalizedK) !== k) {
      setK(String(normalizedK));
    }

    void loadNearby(
      {
        x: selectedVertex.x,
        y: selectedVertex.y,
        k: normalizedK,
        zoom: viewZoom,
      },
      { preserveSelection: true },
    );
  }, [k, loadNearby, selectedVertex, selection.phase, selection.sourceVertexId, viewZoom]);

  const onLoad = async (event: FormEvent) => {
    event.preventDefault();
    const xx = Number.parseFloat(x);
    const yy = Number.parseFloat(y);
    const kk = Number.parseInt(k, 10);

    if (!Number.isFinite(xx) || !Number.isFinite(yy) || !Number.isFinite(kk)) {
      return;
    }

    const normalizedK = normalizeNearbyK(kk);
    if (normalizedK !== kk) {
      setK(String(normalizedK));
    }

    await loadMeta();
    await loadNearby({ x: xx, y: yy, k: normalizedK, zoom: viewZoom });
    await fetchTrafficState();
  };

  const fillFromSelection = () => {
    if (!selectedVertex) {
      return;
    }
    setX(selectedVertex.x.toFixed(4));
    setY(selectedVertex.y.toFixed(4));
  };

  const onRebuild = async () => {
    const xx = Number.parseFloat(x);
    const yy = Number.parseFloat(y);
    const kk = Number.parseInt(k, 10);
    const nn = Number.parseInt(nVertices, 10);

    if (!Number.isFinite(xx) || !Number.isFinite(yy) || !Number.isFinite(kk) || !Number.isFinite(nn)) {
      return;
    }
    const normalizedK = normalizeNearbyK(kk);
    if (normalizedK !== kk) {
      setK(String(normalizedK));
    }
    if (nn < REBUILD_VERTEX_MIN || nn > REBUILD_VERTEX_MAX) {
      return;
    }

    await rebuildGraph(nn, { x: xx, y: yy, k: normalizedK, zoom: viewZoom });
  };

  return (
    <aside className="graph-controls">
      <h1>M5 Graph Demo</h1>
      <p className="subtitle">交通着色 + 静态/动态路径对比 + WebSocket 实时更新</p>

      <form className="control-form" onSubmit={onLoad}>
        <div>
          <Label htmlFor="graph-x">x</Label>
          <Input id="graph-x" value={x} onChange={(event) => setX(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="graph-y">y</Label>
          <Input id="graph-y" value={y} onChange={(event) => setY(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="graph-k">k (100-50000)</Label>
          <Input
            id="graph-k"
            max={NEARBY_K_MAX}
            min={NEARBY_K_MIN}
            type="number"
            value={k}
            onChange={(event) => setK(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="graph-n-vertices">n vertices ({REBUILD_VERTEX_MIN}-{REBUILD_VERTEX_MAX})</Label>
          <Input
            id="graph-n-vertices"
            value={nVertices}
            onChange={(event) => setNVertices(event.target.value)}
          />
        </div>
        <Button disabled={network.loadingNearby || network.loadingMeta} type="submit">
          {network.loadingNearby || network.loadingMeta ? "加载中..." : "加载附近点边"}
        </Button>
        <Button
          disabled={network.loadingRebuild || network.loadingNearby || network.loadingMeta}
          onClick={() => void onRebuild()}
          type="button"
          variant="secondary"
        >
          {network.loadingRebuild ? "重建中..." : "按点数重建图"}
        </Button>
        <Button disabled={!selectedVertex} onClick={fillFromSelection} type="button" variant="outline">
          使用当前选中点坐标
        </Button>
      </form>

      <Button onClick={clearSelection} type="button" variant="secondary">
        清空选择/路径
      </Button>

      <Card className="status-block">
        <CardHeader>
          <CardTitle>路径模式</CardTitle>
        </CardHeader>
        <CardContent>
        <div className="mode-row">
          <Button
            onClick={() => setPathMode("compare")}
            size="sm"
            type="button"
            variant={pathMode === "compare" ? "default" : "outline"}
          >
            对比
          </Button>
          <Button
            onClick={() => setPathMode("static")}
            size="sm"
            type="button"
            variant={pathMode === "static" ? "default" : "outline"}
          >
            静态
          </Button>
          <Button
            onClick={() => setPathMode("traffic")}
            size="sm"
            type="button"
            variant={pathMode === "traffic" ? "default" : "outline"}
          >
            动态
          </Button>
        </div>
        </CardContent>
      </Card>

      <Card className="status-block">
        <CardHeader>
          <CardTitle>交通更新</CardTitle>
        </CardHeader>
        <CardContent>
        <div className="traffic-actions">
          <Button disabled={network.loadingTraffic} onClick={() => void fetchTrafficState()} type="button" variant="outline">
            {network.loadingTraffic ? "刷新中..." : "刷新交通状态"}
          </Button>
          <label className="polling-toggle">
            <Switch
              checked={trafficPollingEnabled}
              onCheckedChange={(checked) => setTrafficPollingEnabled(Boolean(checked))}
            />
            自动实时更新(WS优先)
          </label>
        </div>
        <p className="hint">traffic timestamp: {trafficTimestamp ? trafficTimestamp.toFixed(2) : "-"}</p>
        <p className="hint">transport: {trafficTransportMode}</p>
        <p className="hint">connection: {trafficConnectionState}</p>
        </CardContent>
      </Card>

      <Card className="status-block">
        <CardHeader>
          <CardTitle>状态</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card className="status-block">
        <CardHeader>
          <CardTitle>图元信息</CardTitle>
        </CardHeader>
        <CardContent>
        <ul>
          <li>n_vertices: {meta?.n_vertices ?? "-"}</li>
          <li>n_edges: {meta?.n_edges ?? "-"}</li>
          <li>incident_edge_count: {graph.incidentEdgeCount}</li>
          <li>cluster threshold: {cluster.threshold?.toFixed(1) ?? "-"}</li>
          <li>cluster leaves: {cluster.leafCount ?? "-"}</li>
        </ul>
        </CardContent>
      </Card>

      {network.loadingPath ? <p className="hint">正在计算最短路...</p> : null}
      {network.error ? <p className="error">{network.error}</p> : null}
      <p className="hint">交互: 点击点选 A/B, 第三次点击重置为新 A; 拖拽平移, 滚轮缩放。</p>
    </aside>
  );
}
