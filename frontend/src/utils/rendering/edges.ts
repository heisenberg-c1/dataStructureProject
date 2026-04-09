import type { Graphics } from "pixi.js";

import type { Edge, TrafficEdgeState, Vertex, ViewState } from "@/types";

import { worldToScreenX, worldToScreenY } from "../coor";
import { edgeStrokeStyle, getEdgeCongestionLevel } from "../style";

interface RenderEdgesInput {
  graphics: Graphics;
  edges: Edge[];
  vertexMap: Map<number, Vertex>;
  trafficEdgesById: Record<number, TrafficEdgeState>;
  view: ViewState;
  width: number;
  height: number;
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

  for (const edge of edges) {
    const level = getEdgeCongestionLevel(edge, trafficEdgesById);
    const stroke = edgeStrokeStyle(level);
    graphics.lineStyle(1, stroke.color, stroke.alpha);

    if (edge.x1 != null && edge.y1 != null && edge.x2 != null && edge.y2 != null) {
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
    const x1 = worldToScreenX(from.x, view, width);
    const y1 = worldToScreenY(from.y, view, height);
    const x2 = worldToScreenX(to.x, view, width);
    const y2 = worldToScreenY(to.y, view, height);
    drawEdgeSegment(graphics, x1, y1, x2, y2);
  }
}
