import type { CongestionLevel, Edge, SelectionState, TrafficEdgeState } from "@/types";

export interface StrokeStyle {
	color: number;
	alpha: number;
}

export interface VertexStyle {
	coreColor: number;
	coreRadius: number;
	coreAlpha: number;
	ringColor: number;
	ringRadius: number;
	ringWidth: number;
	ringAlpha: number;
	haloColor: number | null;
	haloRadius: number;
	haloAlpha: number;
}

export function congestionLevelFromRatio(ratio: number): CongestionLevel {
	if (ratio <= 0.72) {
		return "green";
	}
	if (ratio <= 1.0) {
		return "yellow";
	}
	return "red";
}

export function getEdgeCongestionLevel(
	edge: Edge,
	trafficEdgesById: Record<number, TrafficEdgeState>,
): CongestionLevel | null {
	const traffic = trafficEdgesById[edge.id];
	if (traffic?.congestion_level) {
		return traffic.congestion_level;
	}
	if (edge.congestion_level) {
		return edge.congestion_level;
	}
	if (typeof traffic?.load_ratio === "number") {
		return congestionLevelFromRatio(traffic.load_ratio);
	}
	if (typeof edge.load_ratio === "number") {
		return congestionLevelFromRatio(edge.load_ratio);
	}
	return null;
}

export function edgeStrokeStyle(level: CongestionLevel | null): StrokeStyle {
	if (level === "green") {
		return { color: 0x22c55e, alpha: 0.7 };
	}
	if (level === "yellow") {
		return { color: 0xeab308, alpha: 0.8 };
	}
	if (level === "red") {
		return { color: 0xef4444, alpha: 0.9 };
	}
	return { color: 0x7a8598, alpha: 0.55 };
}

export function getVertexStyle(vertexId: number, selection: SelectionState, hoverVertexId: number | null): VertexStyle {
	if (selection.sourceVertexId === vertexId) {
		return {
			coreColor: 0x16a34a,
			coreRadius: 4.8,
			coreAlpha: 0.96,
			ringColor: 0x14532d,
			ringRadius: 6.1,
			ringWidth: 1.2,
			ringAlpha: 0.92,
			haloColor: 0x22c55e,
			haloRadius: 8.2,
			haloAlpha: 0.23,
		};
	}

	if (selection.targetVertexId === vertexId) {
		return {
			coreColor: 0x2563eb,
			coreRadius: 4.8,
			coreAlpha: 0.96,
			ringColor: 0x1e3a8a,
			ringRadius: 6.1,
			ringWidth: 1.2,
			ringAlpha: 0.92,
			haloColor: 0x3b82f6,
			haloRadius: 8.2,
			haloAlpha: 0.23,
		};
	}

	if (hoverVertexId === vertexId) {
		return {
			coreColor: 0xfbbf24,
			coreRadius: 4.2,
			coreAlpha: 0.96,
			ringColor: 0xb45309,
			ringRadius: 5.4,
			ringWidth: 1.1,
			ringAlpha: 0.9,
			haloColor: 0xf59e0b,
			haloRadius: 7.4,
			haloAlpha: 0.2,
		};
	}

	return {
		coreColor: 0x96a2b3,
		coreRadius: 2.6,
		coreAlpha: 0.96,
		ringColor: 0x334155,
		ringRadius: 3.8,
		ringWidth: 0.85,
		ringAlpha: 0.22,
		haloColor: null,
		haloRadius: 0,
		haloAlpha: 0,
	};
}
