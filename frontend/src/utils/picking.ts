import type { Vertex, ViewState } from "@/types";

import { screenToWorld, worldToScreenX, worldToScreenY } from "./coor";

export const HOVER_PICK_THRESHOLD = 12;
export const SELECT_PICK_THRESHOLD = 14;

interface KdPoint {
	id: number;
	x: number;
	y: number;
}

interface KdNode {
	point: KdPoint;
	axis: 0 | 1;
	left: KdNode | null;
	right: KdNode | null;
}

function buildKdTree(points: KdPoint[], depth: number): KdNode | null {
	if (points.length === 0) {
		return null;
	}

	const axis: 0 | 1 = depth % 2 === 0 ? 0 : 1;
	const sorted = points.slice().sort((a, b) => (axis === 0 ? a.x - b.x : a.y - b.y));
	const median = Math.floor(sorted.length / 2);

	return {
		point: sorted[median],
		axis,
		left: buildKdTree(sorted.slice(0, median), depth + 1),
		right: buildKdTree(sorted.slice(median + 1), depth + 1),
	};
}

export class VertexKDTreeIndex {
	private readonly root: KdNode | null;

	constructor(vertices: Vertex[]) {
		const points: KdPoint[] = vertices.map((vertex) => ({
			id: vertex.id,
			x: vertex.x,
			y: vertex.y,
		}));
		this.root = buildKdTree(points, 0);
	}

	findNearest(worldX: number, worldY: number, maxWorldDistance: number): number | null {
		if (!this.root || maxWorldDistance <= 0) {
			return null;
		}

		let bestId: number | null = null;
		let bestDistanceSquared = maxWorldDistance * maxWorldDistance;

		const visit = (node: KdNode | null): void => {
			if (!node) {
				return;
			}

			const dx = node.point.x - worldX;
			const dy = node.point.y - worldY;
			const distanceSquared = dx * dx + dy * dy;
			if (distanceSquared < bestDistanceSquared) {
				bestDistanceSquared = distanceSquared;
				bestId = node.point.id;
			}

			const delta = node.axis === 0 ? worldX - node.point.x : worldY - node.point.y;
			const near = delta < 0 ? node.left : node.right;
			const far = delta < 0 ? node.right : node.left;

			visit(near);
			if (delta * delta < bestDistanceSquared) {
				visit(far);
			}
		};

		visit(this.root);
		return bestId;
	}
}

export function pickNearestVertex(
	screenX: number,
	screenY: number,
	vertices: Vertex[],
	view: ViewState,
	width: number,
	height: number,
	threshold = HOVER_PICK_THRESHOLD,
	index: VertexKDTreeIndex | null = null,
): number | null {
	if (vertices.length === 0 || view.zoom <= 0) {
		return null;
	}

	if (index) {
		const world = screenToWorld(screenX, screenY, view, width, height);
		const maxWorldDistance = threshold / view.zoom;
		return index.findNearest(world.x, world.y, maxWorldDistance);
	}

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
