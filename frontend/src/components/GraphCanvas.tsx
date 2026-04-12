import { useEffect, useMemo, useRef } from "react";

import { usePixiApp } from "@/hooks/usePixiApp";
import { useViewportControl } from "@/hooks/useViewportControl";
import { renderEdges } from "../utils/rendering/edges";
import { renderPaths } from "../utils/rendering/paths";
import { renderVertices } from "../utils/rendering/vertices";
import { useGraphStore } from "@/store/graphStore";
import type { Edge, Vertex, ViewState } from "@/types";
import { VertexKDTreeIndex } from "@/utils/picking";

const ZOOM_BUCKET_BASE = 1.18;

function zoomBucket(zoom: number): number {
  if (zoom <= 1) {
    return 0;
  }
  return Math.floor(Math.log(zoom) / Math.log(ZOOM_BUCKET_BASE));
}

function pathSignature(path: { edgeIds: number[]; vertexIds: number[] } | null): string {
  if (!path) {
    return "none";
  }
  return `${path.edgeIds.join(",")}|${path.vertexIds.join(",")}`;
}

export function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const verticesRef = useRef<Vertex[]>([]);
  const spatialIndexRef = useRef<VertexKDTreeIndex | null>(null);
  const edgesRenderKeyRef = useRef<string>("");
  const pathsRenderKeyRef = useRef<string>("");
  const verticesRenderKeyRef = useRef<string>("");
  const committedViewRef = useRef<ViewState>({ zoom: 900, panX: 0, panY: 0 });
  const interactionViewRef = useRef<ViewState>({ zoom: 900, panX: 0, panY: 0 });

  const { app, interactionContainer, layers } = usePixiApp(containerRef);

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
  const nearbyRequestId = useGraphStore((state) => state.request.nearbyRequestId);
  const trafficLastSeq = useGraphStore((state) => state.trafficLastSeq);

  useEffect(() => {
    verticesRef.current = vertices;
    spatialIndexRef.current = new VertexKDTreeIndex(vertices);
  }, [vertices]);

  useEffect(() => {
    committedViewRef.current = view;
    interactionViewRef.current = view;

    if (interactionContainer && !interactionContainer.destroyed) {
      interactionContainer.scale.set(1, 1);
      interactionContainer.position.set(0, 0);
    }
  }, [interactionContainer, view]);

  useViewportControl({
    app,
    interactionContainer,
    verticesRef,
    spatialIndexRef,
    committedViewRef,
    interactionViewRef,
  });

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
    if (!hasLoadedGraph || loadingNearby) {
      return;
    }

    const graphBucket = currentGraphZoom == null ? null : zoomBucket(currentGraphZoom);
    const viewBucket = zoomBucket(view.zoom);
    const crossedBucket = graphBucket == null || graphBucket !== viewBucket;
    const nowClustered = currentClusterThreshold == null ? false : view.zoom < currentClusterThreshold;
    const crossedBoundary = currentClusterThreshold != null && nowClustered !== currentClustered;

    if (!crossedBoundary && !crossedBucket) {
      return;
    }

    const timer = window.setTimeout(() => {
      void reloadNearbyForCurrentZoom();
    }, 110);
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
    const edgesGraphics = layers.edges;

    if (
      !app ||
      app.stage.destroyed ||
      !edgesGraphics ||
      edgesGraphics.destroyed
    ) {
      return;
    }

    const width = app.screen.width;
    const height = app.screen.height;
    const renderKey = `${nearbyRequestId}|${trafficLastSeq}|${edges.length}|${view.zoom}|${view.panX}|${view.panY}`;
    if (edgesRenderKeyRef.current === renderKey) {
      return;
    }
    edgesRenderKeyRef.current = renderKey;

    renderEdges({
      graphics: edgesGraphics,
      edges,
      vertexMap,
      trafficEdgesById,
      view,
      width,
      height,
    });
  }, [
    app,
    edges,
    layers.edges,
    nearbyRequestId,
    trafficLastSeq,
    trafficEdgesById,
    vertexMap,
    view,
  ]);

  useEffect(() => {
    const pathEdgesGraphics = layers.pathEdges;
    const pathVerticesOutlineGraphics = layers.pathVerticesOutline;
    const pathVerticesGraphics = layers.pathVertices;

    if (
      !app ||
      app.stage.destroyed ||
      !pathEdgesGraphics ||
      pathEdgesGraphics.destroyed ||
      !pathVerticesOutlineGraphics ||
      pathVerticesOutlineGraphics.destroyed ||
      !pathVerticesGraphics ||
      pathVerticesGraphics.destroyed
    ) {
      return;
    }

    const width = app.screen.width;
    const height = app.screen.height;
    const renderKey = `${nearbyRequestId}|${pathMode}|${pathSignature(staticPath)}|${pathSignature(trafficPath)}|${view.zoom}|${view.panX}|${view.panY}`;
    if (pathsRenderKeyRef.current === renderKey) {
      return;
    }
    pathsRenderKeyRef.current = renderKey;

    renderPaths({
      graphics: {
        edges: pathEdgesGraphics,
        verticesOutline: pathVerticesOutlineGraphics,
        vertices: pathVerticesGraphics,
      },
      pathMode,
      staticPath,
      trafficPath,
      edgeMap,
      vertexMap,
      view,
      width,
      height,
    });
  }, [
    app,
    edgeMap,
    layers.pathEdges,
    layers.pathVertices,
    layers.pathVerticesOutline,
    nearbyRequestId,
    pathMode,
    staticPath,
    trafficPath,
    vertexMap,
    view,
  ]);

  useEffect(() => {
    const vertexHalosGraphics = layers.vertexHalos;
    const verticesGraphics = layers.vertices;
    const vertexRingsGraphics = layers.vertexRings;

    if (
      !app ||
      app.stage.destroyed ||
      !vertexHalosGraphics ||
      vertexHalosGraphics.destroyed ||
      !verticesGraphics ||
      verticesGraphics.destroyed ||
      !vertexRingsGraphics ||
      vertexRingsGraphics.destroyed
    ) {
      return;
    }

    const renderKey = `${nearbyRequestId}|${vertices.length}|${selection.phase}|${selection.sourceVertexId ?? "n"}|${selection.targetVertexId ?? "n"}|${hoverVertexId ?? "n"}|${view.zoom}|${view.panX}|${view.panY}`;
    if (verticesRenderKeyRef.current === renderKey) {
      return;
    }
    verticesRenderKeyRef.current = renderKey;

    renderVertices({
      graphics: {
        halos: vertexHalosGraphics,
        cores: verticesGraphics,
        rings: vertexRingsGraphics,
      },
      vertices,
      selection,
      hoverVertexId,
      view,
      width: app.screen.width,
      height: app.screen.height,
    });
  }, [
    app,
    hoverVertexId,
    layers.vertexHalos,
    layers.vertexRings,
    layers.vertices,
    nearbyRequestId,
    selection,
    vertices,
    view,
  ]);

  return <div className="graph-canvas" ref={containerRef} />;
}
