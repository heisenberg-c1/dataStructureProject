export type PathMode = "compare" | "static" | "traffic";

export interface ClusterInfo {
	clustered: boolean;
	mode: string;
	rawVertexCount: number;
	displayVertexCount: number;
	rawEdgeCount: number;
	displayEdgeCount: number;
	mergedEdgeCount: number;
	threshold: number | null;
	zoom: number | null;
	cellSize: number | null;
	leafCount: number | null;
}

export interface PathData {
	vertexIds: number[];
	edgeIds: number[];
	totalLength: number;
	mode: Exclude<PathMode, "compare">;
	totalTravelTime: number | null;
}
