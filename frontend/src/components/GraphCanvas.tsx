import { useEffect, useMemo, useRef } from "react";
import { Application, Graphics } from "pixi.js";

import { useGraphStore } from "@/store/graphStore";
import type { Edge, Vertex, ViewState } from "@/types/graph";

function worldToScreen(vertex: Vertex, view: ViewState, width: number, height: number): { x: number; y: number } {
  return {
    x: (vertex.x - 0.5) * view.zoom + width / 2 + view.panX,
    y: (vertex.y - 0.5) * view.zoom + height / 2 + view.panY,
  };
}

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
  threshold = 10,
): number | null {
  let bestId: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const vertex of vertices) {
    const point = worldToScreen(vertex, view, width, height);
    const dx = point.x - screenX;
    const dy = point.y - screenY;
    const distance = Math.hypot(dx, dy);
    if (distance < threshold && distance < bestDistance) {
      bestDistance = distance;
      bestId = vertex.id;
    }
  }

  return bestId;
}

export function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const verticesRef = useRef<Vertex[]>([]);

  const edgesGraphicsRef = useRef<Graphics | null>(null);
  const verticesGraphicsRef = useRef<Graphics | null>(null);
  const pathEdgesGraphicsRef = useRef<Graphics | null>(null);
  const pathVerticesGraphicsRef = useRef<Graphics | null>(null);

  const vertices = useGraphStore((state) => state.graph.vertices);
  const edges = useGraphStore((state) => state.graph.edges);
  const selection = useGraphStore((state) => state.selection);
  const path = useGraphStore((state) => state.path);
  const view = useGraphStore((state) => state.view);
  const hoverVertexId = useGraphStore((state) => state.hover.vertexId);

  useEffect(() => {
    verticesRef.current = vertices;
  }, [vertices]);

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

    const edgesGraphics = new Graphics();
    const verticesGraphics = new Graphics();
    const pathEdgesGraphics = new Graphics();
    const pathVerticesGraphics = new Graphics();

    edgesGraphicsRef.current = edgesGraphics;
    verticesGraphicsRef.current = verticesGraphics;
    pathEdgesGraphicsRef.current = pathEdgesGraphics;
    pathVerticesGraphicsRef.current = pathVerticesGraphics;

    app.stage.addChild(edgesGraphics);
    app.stage.addChild(pathEdgesGraphics);
    app.stage.addChild(verticesGraphics);
    app.stage.addChild(pathVerticesGraphics);

    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      moved = false;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const nearest = pickNearestVertex(
        localX,
        localY,
        verticesRef.current,
        useGraphStore.getState().view,
        app.screen.width,
        app.screen.height,
      );
      useGraphStore.getState().setHover(nearest);

      if (!dragging) {
        return;
      }

      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        moved = true;
      }

      const current = useGraphStore.getState().view;
      useGraphStore.getState().setView({
        panX: current.panX + dx,
        panY: current.panY + dy,
      });
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
          useGraphStore.getState().view,
          app.screen.width,
          app.screen.height,
          12,
        );
        if (nearest != null) {
          useGraphStore.getState().selectVertex(nearest);
        }
      }

      dragging = false;
      moved = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const onPointerLeave = () => {
      dragging = false;
      moved = false;
      useGraphStore.getState().setHover(null);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;

      const current = useGraphStore.getState().view;
      const direction = event.deltaY > 0 ? 0.9 : 1.1;
      const nextZoom = current.zoom * direction;

      const world = screenToWorld(sx, sy, current, app.screen.width, app.screen.height);
      const nextPanX = sx - app.screen.width / 2 - (world.x - 0.5) * nextZoom;
      const nextPanY = sy - app.screen.height / 2 - (world.y - 0.5) * nextZoom;

      useGraphStore.getState().setView({
        zoom: nextZoom,
        panX: nextPanX,
        panY: nextPanY,
      });
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

      edgesGraphics.destroy();
      verticesGraphics.destroy();
      pathEdgesGraphics.destroy();
      pathVerticesGraphics.destroy();

      app.destroy(true, true);
      appRef.current = null;
      edgesGraphicsRef.current = null;
      verticesGraphicsRef.current = null;
      pathEdgesGraphicsRef.current = null;
      pathVerticesGraphicsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const app = appRef.current;
    const edgesGraphics = edgesGraphicsRef.current;
    const verticesGraphics = verticesGraphicsRef.current;
    const pathEdgesGraphics = pathEdgesGraphicsRef.current;
    const pathVerticesGraphics = pathVerticesGraphicsRef.current;

    if (!app || !edgesGraphics || !verticesGraphics || !pathEdgesGraphics || !pathVerticesGraphics) {
      return;
    }

    const width = app.screen.width;
    const height = app.screen.height;

    edgesGraphics.clear();
    edgesGraphics.lineStyle(1, 0x7a8598, 0.55);

    for (const edge of edges) {
      const from = vertexMap.get(edge.u);
      const to = vertexMap.get(edge.v);
      if (!from || !to) {
        continue;
      }
      const p1 = worldToScreen(from, view, width, height);
      const p2 = worldToScreen(to, view, width, height);
      edgesGraphics.moveTo(p1.x, p1.y);
      edgesGraphics.lineTo(p2.x, p2.y);
    }

    verticesGraphics.clear();
    for (const vertex of vertices) {
      const point = worldToScreen(vertex, view, width, height);
      let color = 0xd8dde6;
      let radius = 2.4;

      if (selection.sourceVertexId === vertex.id) {
        color = 0x1f9d55;
        radius = 4.5;
      } else if (selection.targetVertexId === vertex.id) {
        color = 0x2d6cdf;
        radius = 4.5;
      } else if (hoverVertexId === vertex.id) {
        color = 0xffc857;
        radius = 3.8;
      }

      verticesGraphics.beginFill(color, 1);
      verticesGraphics.drawCircle(point.x, point.y, radius);
      verticesGraphics.endFill();
    }

    pathEdgesGraphics.clear();
    pathVerticesGraphics.clear();

    if (path) {
      pathEdgesGraphics.lineStyle(3, 0xff7b00, 0.92);
      for (const edgeId of path.edgeIds) {
        const edge = edgeMap.get(edgeId);
        if (!edge) {
          continue;
        }
        const from = vertexMap.get(edge.u);
        const to = vertexMap.get(edge.v);
        if (!from || !to) {
          continue;
        }
        const p1 = worldToScreen(from, view, width, height);
        const p2 = worldToScreen(to, view, width, height);
        pathEdgesGraphics.moveTo(p1.x, p1.y);
        pathEdgesGraphics.lineTo(p2.x, p2.y);
      }

      for (const vertexId of path.vertexIds) {
        const vertex = vertexMap.get(vertexId);
        if (!vertex) {
          continue;
        }
        const point = worldToScreen(vertex, view, width, height);
        pathVerticesGraphics.beginFill(0xff7b00, 1);
        pathVerticesGraphics.drawCircle(point.x, point.y, 3.4);
        pathVerticesGraphics.endFill();
      }
    }
  }, [edgeMap, edges, hoverVertexId, path, selection, vertexMap, vertices, view]);

  return <div className="graph-canvas" ref={containerRef} />;
}
