import type { ViewState } from "@/types";

const WORLD_CENTER = 0.5;

export function worldToScreenX(x: number, view: ViewState, width: number): number {
	return (x - WORLD_CENTER) * view.zoom + width / 2 + view.panX;
}

export function worldToScreenY(y: number, view: ViewState, height: number): number {
	return (y - WORLD_CENTER) * view.zoom + height / 2 + view.panY;
}

export function screenToWorld(
	screenX: number,
	screenY: number,
	view: ViewState,
	width: number,
	height: number,
): { x: number; y: number } {
	return {
		x: (screenX - width / 2 - view.panX) / view.zoom + WORLD_CENTER,
		y: (screenY - height / 2 - view.panY) / view.zoom + WORLD_CENTER,
	};
}
