import { useEffect, useMemo, useRef } from "react";
import { Application, Container, Graphics } from "pixi.js";

import { debounce, throttle } from "../lib/throttle";
import { getViewZoomMax, useGraphStore, VIEW_ZOOM_MIN } from "@/store/graphStore";
import type { CongestionLevel, Edge, PathData, Vertex, ViewState } from "@/types/graph";

const HOVER_THROTTLE_MS = 16;
const VIEW_COMMIT_DEBOUNCE_MS = 90;

// World space is normalized to [0,1] and centered at (0.5, 0.5).
function worldToScreenX(x: number, view: ViewState, width: number): number {
  return (x - 0.5) * view.zoom + width / 2 + view.panX;
}

function worldToScreenY(y: number, view: ViewState, height: number): number {
  return (y - 0.5) * view.zoom + height / 2 + view.panY;
}

// Inverse of worldToScreen under the same view/viewport.
function screenToWorld(screenX: number, screenY: number, view: ViewState, width: number, height: number): { x: number; y: number } {
  return {
    x: (screenX - width / 2 - view.panX) / view.zoom + 0.5,
    y: (screenY - height / 2 - view.panY) / view.zoom + 0.5,
  };
}

function pickNearestVertex(
  screenX: number,
  screenY: number,
  vertices: Vertex[],
  view: ViewState,
  width: number,
  height: number,
  threshold = 12,
): number | null {
  let bestId: number | null = null;
  const thresholdSquared = threshold * threshold;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const vertex of vertices) {
    const vx = worldToScreenX(vertex.x, view, width);
    const vy = worldToScreenY(vertex.y, view, height);
    const dx = vx - screenX;
    const dy = vy - screenY;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < thresholdSquared && distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      bestId = vertex.id;
    }
  }

  return bestId;
}

function congestionLevelFromRatio(ratio: number): CongestionLevel {
  if (ratio <= 0.72) {
    return "green";
  }
  if (ratio <= 1.0) {
    return "yellow";
  }
  return "red";
}

function getEdgeCongestionLevel(edge: Edge, trafficEdgesById: Record<number, { load_ratio: number; congestion_level: CongestionLevel }>): CongestionLevel | null {
  const traffic = trafficEdgesById[edge.id];
  if (traffic?.congestion_level) {
    return traffic.congestion_level;
  }
  if (edge.congestion_level) {
    return edge.congestion_level;
  }
  if (typeof traffic?.load_ratio === "number") {
    return congestionLevelFromRatio(traffic.load_ratio);
  }
  if (typeof edge.load_ratio === "number") {
    return congestionLevelFromRatio(edge.load_ratio);
  }
  return null;
}

function edgeStrokeStyle(level: CongestionLevel | null): { color: number; alpha: number } {
  if (level === "green") {
    return { color: 0x22c55e, alpha: 0.7 };
  }
  if (level === "yellow") {
    return { color: 0xeab308, alpha: 0.8 };
  }
  if (level === "red") {
    return { color: 0xef4444, alpha: 0.9 };
  }
  return { color: 0x7a8598, alpha: 0.55 };
}

export function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const interactionContainerRef = useRef<Container | null>(null);
  const verticesRef = useRef<Vertex[]>([]);
  const committedViewRef = useRef<ViewState>({ zoom: 900, panX: 0, panY: 0 });
  const interactionViewRef = useRef<ViewState>({ zoom: 900, panX: 0, panY: 0 });

  const edgesGraphicsRef = useRef<Graphics | null>(null);
  const vertexHalosGraphicsRef = useRef<Graphics | null>(null);
  const verticesGraphicsRef = useRef<Graphics | null>(null);
  const vertexRingsGraphicsRef = useRef<Graphics | null>(null);
  const pathEdgesGraphicsRef = useRef<Graphics | null>(null);
  const pathVerticesOutlineGraphicsRef = useRef<Graphics | null>(null);
  const pathVerticesGraphicsRef = useRef<Graphics | null>(null);

  const vertices = useGraphStore((state) => state.graph.vertices);
  const edges = useGraphStore((state) => state.graph.edges);
  const selection = useGraphStore((state) => state.selection);
  const pathMode = useGraphStore((state) => state.pathMode);
  const staticPath = useGraphStore((state) => state.staticPath);
  const trafficPath = useGraphStore((state) => state.trafficPath);
  const trafficEdgesById = useGraphStore((state) => state.trafficEdgesById);
  const view = useGraphStore((state) => state.view);
  const hoverVertexId = useGraphStore((state) => state.hover.vertexId);
  const hasLoadedGraph = useGraphStore((state) => state.graph.vertexIds.length > 0);
  const currentGraphZoom = useGraphStore((state) => state.graph.cluster.zoom);
  const currentClustered = useGraphStore((state) => state.graph.cluster.clustered);
  const currentClusterThreshold = useGraphStore((state) => state.graph.cluster.threshold);
  const loadingNearby = useGraphStore((state) => state.network.loadingNearby);
  const reloadNearbyForCurrentZoom = useGraphStore((state) => state.reloadNearbyForCurrentZoom);

  useEffect(() => {
    verticesRef.current = vertices;
  }, [vertices]);

  useEffect(() => {
    committedViewRef.current = view;
    interactionViewRef.current = view;

    const interactionContainer = interactionContainerRef.current;
    if (interactionContainer) {
      interactionContainer.scale.set(1, 1);
      interactionContainer.position.set(0, 0);
    }
  }, [view]);

  const vertexMap = useMemo(() => {
    const map = new Map<number, Vertex>();
    for (const vertex of vertices) {
      map.set(vertex.id, vertex);
    }
    return map;
  }, [vertices]);

  const edgeMap = useMemo(() => {
    const map = new Map<number, Edge>();
    for (const edge of edges) {
      map.set(edge.id, edge);
    }
    return map;
  }, [edges]);

  useEffect(() => {
    if (!containerRef.current || appRef.current) {
      return;
    }

    const app = new Application({
      resizeTo: containerRef.current,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      backgroundAlpha: 0,
    });

    appRef.current = app;
    containerRef.current.appendChild(app.view as HTMLCanvasElement);
    const canvas = app.view as HTMLCanvasElement;
    canvas.style.display = "block";
    canvas.style.touchAction = "none";

    const interactionContainer = new Container();
    interactionContainerRef.current = interactionContainer;

    const edgesGraphics = new Graphics();
    const vertexHalosGraphics = new Graphics();
    const verticesGraphics = new Graphics();
    const vertexRingsGraphics = new Graphics();
    const pathEdgesGraphics = new Graphics();
    const pathVerticesOutlineGraphics = new Graphics();
    const pathVerticesGraphics = new Graphics();

    edgesGraphicsRef.current = edgesGraphics;
    vertexHalosGraphicsRef.current = vertexHalosGraphics;
    verticesGraphicsRef.current = verticesGraphics;
    vertexRingsGraphicsRef.current = vertexRingsGraphics;
    pathEdgesGraphicsRef.current = pathEdgesGraphics;
    pathVerticesOutlineGraphicsRef.current = pathVerticesOutlineGraphics;
    pathVerticesGraphicsRef.current = pathVerticesGraphics;

    app.stage.addChild(interactionContainer);
    interactionContainer.addChild(edgesGraphics);
    interactionContainer.addChild(pathEdgesGraphics);
    interactionContainer.addChild(vertexHalosGraphics);
    interactionContainer.addChild(verticesGraphics);
    interactionContainer.addChild(vertexRingsGraphics);
    interactionContainer.addChild(pathVerticesOutlineGraphics);
    interactionContainer.addChild(pathVerticesGraphics);

    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;

    const applyTransientTransform = (baseView: ViewState, nextView: ViewState) => {
      const scale = nextView.zoom / baseView.zoom;
      const baseCenterX = app.screen.width / 2 + baseView.panX;
      const baseCenterY = app.screen.height / 2 + baseView.panY;
      const nextCenterX = app.screen.width / 2 + nextView.panX;
      const nextCenterY = app.screen.height / 2 + nextView.panY;

      interactionContainer.scale.set(scale, scale);
      interactionContainer.position.set(
        nextCenterX - scale * baseCenterX,
        nextCenterY - scale * baseCenterY,
      );
    };

    const commitInteractionView = () => {
      const nextView = interactionViewRef.current;
      const currentView = useGraphStore.getState().view;
      if (
        nextView.zoom === currentView.zoom &&
        nextView.panX === currentView.panX &&
        nextView.panY === currentView.panY
      ) {
        return;
      }
      useGraphStore.getState().setView(nextView);
    };

    const throttledHoverPick = throttle((localX: number, localY: number) => {
      const nearest = pickNearestVertex(
        localX,
        localY,
        verticesRef.current,
        interactionViewRef.current,
        app.screen.width,
        app.screen.height,
      );
      useGraphStore.getState().setHover(nearest);
    }, HOVER_THROTTLE_MS);

    const debouncedCommitView = debounce(() => {
      commitInteractionView();
    }, VIEW_COMMIT_DEBOUNCE_MS);

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      moved = false;
      lastX = event.clientX;
      lastY = event.clientY;
      debouncedCommitView.cancel();
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      throttledHoverPick(localX, localY);

      if (!dragging) {
        return;
      }

      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        moved = true;
      }

      const current = interactionViewRef.current;
      const next = {
        ...current,
        panX: current.panX + dx,
        panY: current.panY + dy,
      };
      interactionViewRef.current = next;
      applyTransientTransform(committedViewRef.current, next);

      lastX = event.clientX;
      lastY = event.clientY;
    };

    const onPointerUp = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;

      if (!moved) {
        const nearest = pickNearestVertex(
          localX,
          localY,
          verticesRef.current,
          interactionViewRef.current,
          app.screen.width,
          app.screen.height,
          14,
        );
        if (nearest != null) {
          useGraphStore.getState().selectVertex(nearest);
        }
      } else {
        debouncedCommitView.cancel();
        commitInteractionView();
      }

      dragging = false;
      moved = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const onPointerLeave = () => {
      throttledHoverPick.cancel();
      dragging = false;
      moved = false;
      debouncedCommitView.cancel();
      commitInteractionView();
      useGraphStore.getState().setHover(null);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.currentTarget !== canvas) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;

      const current = interactionViewRef.current;
      const direction = event.deltaY > 0 ? 0.9 : 1.1;
      const maxZoom = getViewZoomMax();
      const nextZoom = Math.max(VIEW_ZOOM_MIN, Math.min(maxZoom, current.zoom * direction));

      if (nextZoom === current.zoom) {
        return;
      }

      const world = screenToWorld(sx, sy, current, app.screen.width, app.screen.height);
      const nextPanX = sx - app.screen.width / 2 - (world.x - 0.5) * nextZoom;
      const nextPanY = sy - app.screen.height / 2 - (world.y - 0.5) * nextZoom;

      interactionViewRef.current = {
        zoom: nextZoom,
        panX: nextPanX,
        panY: nextPanY,
      };
      applyTransientTransform(committedViewRef.current, interactionViewRef.current);
      debouncedCommitView();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);

      throttledHoverPick.cancel();
      debouncedCommitView.cancel();

      edgesGraphics.destroy();
      vertexHalosGraphics.destroy();
      verticesGraphics.destroy();
      vertexRingsGraphics.destroy();
      pathEdgesGraphics.destroy();
      pathVerticesOutlineGraphics.destroy();
      pathVerticesGraphics.destroy();
      interactionContainer.destroy({ children: false });

      app.destroy(true, true);
      appRef.current = null;
      interactionContainerRef.current = null;
      edgesGraphicsRef.current = null;
      vertexHalosGraphicsRef.current = null;
      verticesGraphicsRef.current = null;
      vertexRingsGraphicsRef.current = null;
      pathEdgesGraphicsRef.current = null;
      pathVerticesOutlineGraphicsRef.current = null;
      pathVerticesGraphicsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedGraph || loadingNearby) {
      return;
    }

    const zoomDelta = currentGraphZoom == null ? Number.POSITIVE_INFINITY : Math.abs(currentGraphZoom - view.zoom);
    const significantDelta = Math.max(80, view.zoom * 0.06);
    const nowClustered = currentClusterThreshold == null ? false : view.zoom < currentClusterThreshold;
    const crossedBoundary = currentClusterThreshold != null && nowClustered !== currentClustered;

    if (!crossedBoundary && zoomDelta < significantDelta) {
      return;
    }

    const timer = window.setTimeout(() => {
      void reloadNearbyForCurrentZoom();
    }, 140);
    return () => {
      window.clearTimeout(timer);
    };
  }, [
    currentClusterThreshold,
    currentClustered,
    currentGraphZoom,
    hasLoadedGraph,
    loadingNearby,
    reloadNearbyForCurrentZoom,
    view.zoom,
  ]);

  useEffect(() => {
    const app = appRef.current;
    const edgesGraphics = edgesGraphicsRef.current;
    const pathEdgesGraphics = pathEdgesGraphicsRef.current;
    const pathVerticesOutlineGraphics = pathVerticesOutlineGraphicsRef.current;
    const pathVerticesGraphics = pathVerticesGraphicsRef.current;

    if (!app || !edgesGraphics || !pathEdgesGraphics || !pathVerticesOutlineGraphics || !pathVerticesGraphics) {
      return;
    }

    const width = app.screen.width;
    const height = app.screen.height;

    edgesGraphics.clear();

    for (const edge of edges) {
      const level = getEdgeCongestionLevel(edge, trafficEdgesById);
      const stroke = edgeStrokeStyle(level);
      edgesGraphics.lineStyle(1, stroke.color, stroke.alpha);

      if (edge.x1 != null && edge.y1 != null && edge.x2 != null && edge.y2 != null) {
        const x1 = worldToScreenX(edge.x1, view, width);
        const y1 = worldToScreenY(edge.y1, view, height);
        const x2 = worldToScreenX(edge.x2, view, width);
        const y2 = worldToScreenY(edge.y2, view, height);
        edgesGraphics.moveTo(x1, y1);
        edgesGraphics.lineTo(x2, y2);
      } else {
        const from = vertexMap.get(edge.u);
        const to = vertexMap.get(edge.v);
        if (!from || !to) {
          continue;
        }
        const x1 = worldToScreenX(from.x, view, width);
        const y1 = worldToScreenY(from.y, view, height);
        const x2 = worldToScreenX(to.x, view, width);
        const y2 = worldToScreenY(to.y, view, height);
        edgesGraphics.moveTo(x1, y1);
        edgesGraphics.lineTo(x2, y2);
      }
    }

    pathEdgesGraphics.clear();
    pathVerticesOutlineGraphics.clear();
    pathVerticesGraphics.clear();

    const drawPath = (
      route: PathData | null,
      color: number,
      outlineColor: number,
      widthPx: number,
      radius: number,
      alpha = 0.92,
    ) => {
      if (!route) {
        return;
      }

      pathEdgesGraphics.lineStyle(widthPx, color, alpha);
      for (const edgeId of route.edgeIds) {
        const edge = edgeMap.get(edgeId);
        if (!edge) {
          continue;
        }
        if (edge.x1 != null && edge.y1 != null && edge.x2 != null && edge.y2 != null) {
          const x1 = worldToScreenX(edge.x1, view, width);
          const y1 = worldToScreenY(edge.y1, view, height);
          const x2 = worldToScreenX(edge.x2, view, width);
          const y2 = worldToScreenY(edge.y2, view, height);
          pathEdgesGraphics.moveTo(x1, y1);
          pathEdgesGraphics.lineTo(x2, y2);
        } else {
          const from = vertexMap.get(edge.u);
          const to = vertexMap.get(edge.v);
          if (!from || !to) {
            continue;
          }
          const x1 = worldToScreenX(from.x, view, width);
          const y1 = worldToScreenY(from.y, view, height);
          const x2 = worldToScreenX(to.x, view, width);
          const y2 = worldToScreenY(to.y, view, height);
          pathEdgesGraphics.moveTo(x1, y1);
          pathEdgesGraphics.lineTo(x2, y2);
        }
      }

      for (const vertexId of route.vertexIds) {
        const vertex = vertexMap.get(vertexId);
        if (!vertex) {
          continue;
        }
        const x = worldToScreenX(vertex.x, view, width);
        const y = worldToScreenY(vertex.y, view, height);
        pathVerticesOutlineGraphics.lineStyle(1.15, outlineColor, 0.88);
        pathVerticesOutlineGraphics.drawCircle(x, y, radius + 0.95);
        pathVerticesGraphics.beginFill(color, 1);
        pathVerticesGraphics.drawCircle(x, y, radius);
        pathVerticesGraphics.endFill();
      }
    };

    if (pathMode !== "traffic") {
      drawPath(staticPath, 0x2d6cdf, 0x1e3a8a, 2.2, 2.9, 0.86);
    }

    if (pathMode !== "static") {
      drawPath(trafficPath, 0xff7b00, 0x9a3412, 3.0, 3.5, 0.95);
    }
  }, [
    edgeMap,
    edges,
    pathMode,
    staticPath,
    trafficEdgesById,
    trafficPath,
    vertexMap,
    view,
  ]);

  useEffect(() => {
    const app = appRef.current;
    const vertexHalosGraphics = vertexHalosGraphicsRef.current;
    const verticesGraphics = verticesGraphicsRef.current;
    const vertexRingsGraphics = vertexRingsGraphicsRef.current;

    if (!app || !vertexHalosGraphics || !verticesGraphics || !vertexRingsGraphics) {
      return;
    }

    const width = app.screen.width;
    const height = app.screen.height;

    vertexHalosGraphics.clear();
    verticesGraphics.clear();
    vertexRingsGraphics.clear();

    for (const vertex of vertices) {
      const x = worldToScreenX(vertex.x, view, width);
      const y = worldToScreenY(vertex.y, view, height);
      let coreColor = 0x96a2b3;
      let coreRadius = 2.6;
      const coreAlpha = 0.96;
      let ringColor = 0x334155;
      let ringRadius = 3.8;
      let ringWidth = 0.85;
      let ringAlpha = 0.22;
      let haloColor: number | null = null;
      let haloRadius = 0;
      let haloAlpha = 0;

      if (selection.sourceVertexId === vertex.id) {
        coreColor = 0x16a34a;
        coreRadius = 4.8;
        ringColor = 0x14532d;
        ringRadius = 6.1;
        ringWidth = 1.2;
        ringAlpha = 0.92;
        haloColor = 0x22c55e;
        haloRadius = 8.2;
        haloAlpha = 0.23;
      } else if (selection.targetVertexId === vertex.id) {
        coreColor = 0x2563eb;
        coreRadius = 4.8;
        ringColor = 0x1e3a8a;
        ringRadius = 6.1;
        ringWidth = 1.2;
        ringAlpha = 0.92;
        haloColor = 0x3b82f6;
        haloRadius = 8.2;
        haloAlpha = 0.23;
      } else if (hoverVertexId === vertex.id) {
        coreColor = 0xfbbf24;
        coreRadius = 4.2;
        ringColor = 0xb45309;
        ringRadius = 5.4;
        ringWidth = 1.1;
        ringAlpha = 0.9;
        haloColor = 0xf59e0b;
        haloRadius = 7.4;
        haloAlpha = 0.2;
      }

      if (haloColor != null) {
        vertexHalosGraphics.beginFill(haloColor, haloAlpha);
        vertexHalosGraphics.drawCircle(x, y, haloRadius);
        vertexHalosGraphics.endFill();
      }

      verticesGraphics.beginFill(coreColor, coreAlpha);
      verticesGraphics.drawCircle(x, y, coreRadius);
      verticesGraphics.endFill();

      vertexRingsGraphics.lineStyle(ringWidth, ringColor, ringAlpha);
      vertexRingsGraphics.drawCircle(x, y, ringRadius);
    }
  }, [
    hoverVertexId,
    selection,
    vertices,
    view,
  ]);

  return <div className="graph-canvas" ref={containerRef} />;
}
