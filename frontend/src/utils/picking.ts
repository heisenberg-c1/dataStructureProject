import type { Vertex, ViewState } from "@/types";

import { worldToScreenX, worldToScreenY } from "./coor";

export const HOVER_PICK_THRESHOLD = 12;
export const SELECT_PICK_THRESHOLD = 14;

export function pickNearestVertex(
	screenX: number,
	screenY: number,
	vertices: Vertex[],
	view: ViewState,
	width: number,
	height: number,
	threshold = HOVER_PICK_THRESHOLD,
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
