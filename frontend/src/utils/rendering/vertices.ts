import type { Graphics } from "pixi.js";

import type { SelectionState, Vertex, ViewState } from "@/types";

import { worldToScreenX, worldToScreenY } from "../coor";
import { getVertexStyle } from "../style";

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

  for (const vertex of vertices) {
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
