import type { Graphics } from "pixi.js";

import type { Edge, PathData, PathMode, Vertex, ViewState } from "@/types";

import { worldToScreenX, worldToScreenY } from "../coor";

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

  graphics.edges.lineStyle(style.widthPx, style.color, style.alpha);
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
      graphics.edges.moveTo(x1, y1);
      graphics.edges.lineTo(x2, y2);
      continue;
    }

    const from = vertexMap.get(edge.u);
    const to = vertexMap.get(edge.v);
    if (!from || !to) {
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
