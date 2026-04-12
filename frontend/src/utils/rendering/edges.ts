import type { Graphics } from "pixi.js";

import type { Edge, TrafficEdgeState, Vertex, ViewState } from "@/types";

import { worldToScreenX, worldToScreenY } from "../coor";
import { edgeStrokeStyle, getEdgeCongestionLevel } from "../style";

const WORLD_CENTER = 0.5;
const CULL_MARGIN_PX = 24;

interface RenderEdgesInput {
  graphics: Graphics;
  edges: Edge[];
  vertexMap: Map<number, Vertex>;
  trafficEdgesById: Record<number, TrafficEdgeState>;
  view: ViewState;
  width: number;
  height: number;
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

function drawEdgeSegment(
  graphics: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  graphics.moveTo(x1, y1);
  graphics.lineTo(x2, y2);
}

export function renderEdges({
  graphics,
  edges,
  vertexMap,
  trafficEdgesById,
  view,
  width,
  height,
}: RenderEdgesInput): void {
  graphics.clear();
  const worldBounds = computeWorldBounds(view, width, height);

  for (const edge of edges) {
    const level = getEdgeCongestionLevel(edge, trafficEdgesById);
    const stroke = edgeStrokeStyle(level);
    graphics.lineStyle(1, stroke.color, stroke.alpha);

    if (edge.x1 != null && edge.y1 != null && edge.x2 != null && edge.y2 != null) {
      if (isSegmentOutsideWorldBounds(edge.x1, edge.y1, edge.x2, edge.y2, worldBounds)) {
        continue;
      }
      const x1 = worldToScreenX(edge.x1, view, width);
      const y1 = worldToScreenY(edge.y1, view, height);
      const x2 = worldToScreenX(edge.x2, view, width);
      const y2 = worldToScreenY(edge.y2, view, height);
      drawEdgeSegment(graphics, x1, y1, x2, y2);
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
    drawEdgeSegment(graphics, x1, y1, x2, y2);
  }
}
