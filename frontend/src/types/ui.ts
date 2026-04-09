import type { Edge, Vertex } from "./domain";
import type { ClusterInfo } from "./feature";

export type TrafficTransportMode = "off" | "websocket" | "polling";

export type TrafficConnectionState = "idle" | "connecting" | "open" | "reconnecting" | "polling" | "closed";

export interface ViewState {
	zoom: number;
	panX: number;
	panY: number;
}

export type SelectionPhase = "idle" | "pickedA" | "pickedAB";

export interface SelectionState {
	phase: SelectionPhase;
	sourceVertexId: number | null;
	targetVertexId: number | null;
}

export interface GraphData {
	vertices: Vertex[];
	edges: Edge[];
	vertexIds: number[];
	incidentEdgeCount: number;
	cluster: ClusterInfo;
}
