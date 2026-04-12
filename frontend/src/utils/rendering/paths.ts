import type { Graphics } from "pixi.js";

import type { Edge, PathData, PathMode, Vertex, ViewState } from "@/types";

import { worldToScreenX, worldToScreenY } from "../coor";

const WORLD_CENTER = 0.5;
const CULL_MARGIN_PX = 24;

interface PathGraphics {
  edges: Graphics;
  verticesOutline: Graphics;
  vertices: Graphics;
}

interface RenderPathsInput {
  graphics: PathGraphics;
  pathMode: PathMode;
  staticPath: PathData | null;
  trafficPath: PathData | null;
  edgeMap: Map<number, Edge>;
  vertexMap: Map<number, Vertex>;
  view: ViewState;
  width: number;
  height: number;
}

interface DrawPathStyle {
  color: number;
  outlineColor: number;
  widthPx: number;
  radius: number;
  alpha: number;
}

interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function computeWorldBounds(view: ViewState, width: number, height: number, marginPx = CULL_MARGIN_PX): WorldBounds {
  const safeZoom = Math.max(1, view.zoom);
  const marginWorld = marginPx / safeZoom;
  const minX = (0 - width / 2 - view.panX) / safeZoom + WORLD_CENTER - marginWorld;
  const maxX = (width - width / 2 - view.panX) / safeZoom + WORLD_CENTER + marginWorld;
  const minY = (0 - height / 2 - view.panY) / safeZoom + WORLD_CENTER - marginWorld;
  const maxY = (height - height / 2 - view.panY) / safeZoom + WORLD_CENTER + marginWorld;
  return { minX, maxX, minY, maxY };
}

function isSegmentOutsideWorldBounds(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bounds: WorldBounds,
): boolean {
  if (x1 < bounds.minX && x2 < bounds.minX) {
    return true;
  }
  if (x1 > bounds.maxX && x2 > bounds.maxX) {
    return true;
  }
  if (y1 < bounds.minY && y2 < bounds.minY) {
    return true;
  }
  if (y1 > bounds.maxY && y2 > bounds.maxY) {
    return true;
  }
  return false;
}

const STATIC_PATH_STYLE: DrawPathStyle = {
  color: 0x2d6cdf,
  outlineColor: 0x1e3a8a,
  widthPx: 2.2,
  radius: 2.9,
  alpha: 0.86,
};

const TRAFFIC_PATH_STYLE: DrawPathStyle = {
  color: 0xff7b00,
  outlineColor: 0x9a3412,
  widthPx: 3.0,
  radius: 3.5,
  alpha: 0.95,
};

function drawPath(
  graphics: PathGraphics,
  route: PathData | null,
  style: DrawPathStyle,
  edgeMap: Map<number, Edge>,
  vertexMap: Map<number, Vertex>,
  view: ViewState,
  width: number,
  height: number,
): void {
  if (!route) {
    return;
  }

  const worldBounds = computeWorldBounds(view, width, height);

  graphics.edges.lineStyle(style.widthPx, style.color, style.alpha);
  for (const edgeId of route.edgeIds) {
    const edge = edgeMap.get(edgeId);
    if (!edge) {
      continue;
    }

    if (edge.x1 != null && edge.y1 != null && edge.x2 != null && edge.y2 != null) {
      if (isSegmentOutsideWorldBounds(edge.x1, edge.y1, edge.x2, edge.y2, worldBounds)) {
        continue;
      }
      const x1 = worldToScreenX(edge.x1, view, width);
      const y1 = worldToScreenY(edge.y1, view, height);
      const x2 = worldToScreenX(edge.x2, view, width);
      const y2 = worldToScreenY(edge.y2, view, height);
      graphics.edges.moveTo(x1, y1);
      graphics.edges.lineTo(x2, y2);
      continue;
    }

    const from = vertexMap.get(edge.u);
    const to = vertexMap.get(edge.v);
    if (!from || !to) {
      continue;
    }
    if (isSegmentOutsideWorldBounds(from.x, from.y, to.x, to.y, worldBounds)) {
      continue;
    }

    const x1 = worldToScreenX(from.x, view, width);
    const y1 = worldToScreenY(from.y, view, height);
    const x2 = worldToScreenX(to.x, view, width);
    const y2 = worldToScreenY(to.y, view, height);
    graphics.edges.moveTo(x1, y1);
    graphics.edges.lineTo(x2, y2);
  }

  for (const vertexId of route.vertexIds) {
    const vertex = vertexMap.get(vertexId);
    if (!vertex) {
      continue;
    }
    if (
      vertex.x < worldBounds.minX ||
      vertex.x > worldBounds.maxX ||
      vertex.y < worldBounds.minY ||
      vertex.y > worldBounds.maxY
    ) {
      continue;
    }

    const x = worldToScreenX(vertex.x, view, width);
    const y = worldToScreenY(vertex.y, view, height);
    graphics.verticesOutline.lineStyle(1.15, style.outlineColor, 0.88);
    graphics.verticesOutline.drawCircle(x, y, style.radius + 0.95);
    graphics.vertices.beginFill(style.color, 1);
    graphics.vertices.drawCircle(x, y, style.radius);
    graphics.vertices.endFill();
  }
}

export function renderPaths({
  graphics,
  pathMode,
  staticPath,
  trafficPath,
  edgeMap,
  vertexMap,
  view,
  width,
  height,
}: RenderPathsInput): void {
  graphics.edges.clear();
  graphics.verticesOutline.clear();
  graphics.vertices.clear();

  if (pathMode !== "traffic") {
    drawPath(graphics, staticPath, STATIC_PATH_STYLE, edgeMap, vertexMap, view, width, height);
  }

  if (pathMode !== "static") {
    drawPath(graphics, trafficPath, TRAFFIC_PATH_STYLE, edgeMap, vertexMap, view, width, height);
  }
}
