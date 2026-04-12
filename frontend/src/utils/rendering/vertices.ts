import type { Graphics } from "pixi.js";

import type { SelectionState, Vertex, ViewState } from "@/types";

import { worldToScreenX, worldToScreenY } from "../coor";
import { getVertexStyle } from "../style";

const WORLD_CENTER = 0.5;
const CULL_MARGIN_PX = 24;

interface VertexGraphics {
  halos: Graphics;
  cores: Graphics;
  rings: Graphics;
}

interface RenderVerticesInput {
  graphics: VertexGraphics;
  vertices: Vertex[];
  selection: SelectionState;
  hoverVertexId: number | null;
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

export function renderVertices({
  graphics,
  vertices,
  selection,
  hoverVertexId,
  view,
  width,
  height,
}: RenderVerticesInput): void {
  graphics.halos.clear();
  graphics.cores.clear();
  graphics.rings.clear();
  const worldBounds = computeWorldBounds(view, width, height);

  for (const vertex of vertices) {
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
    const style = getVertexStyle(vertex.id, selection, hoverVertexId);

    if (style.haloColor != null) {
      graphics.halos.beginFill(style.haloColor, style.haloAlpha);
      graphics.halos.drawCircle(x, y, style.haloRadius);
      graphics.halos.endFill();
    }

    graphics.cores.beginFill(style.coreColor, style.coreAlpha);
    graphics.cores.drawCircle(x, y, style.coreRadius);
    graphics.cores.endFill();

    graphics.rings.lineStyle(style.ringWidth, style.ringColor, style.ringAlpha);
    graphics.rings.drawCircle(x, y, style.ringRadius);
  }
}
