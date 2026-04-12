import type { Bounds, Edge, TrafficEdgeState, Vertex } from "./domain";

export interface GraphMetaResponse {
	n_vertices: number;
	n_edges: number;
	bounds: Bounds;
}

export interface NearbyResponse {
	vertex_ids: number[];
	vertices: Vertex[];
	edges: Edge[];
	incident_edge_count: number;
	clustered?: boolean;
	cluster_mode?: string;
	raw_vertex_count?: number;
	display_vertex_count?: number;
	raw_edge_count?: number;
	display_edge_count?: number;
	merged_edge_count?: number;
	cluster_threshold?: number;
	zoom?: number | null;
	cluster_cell_size?: number | null;
	cluster_leaf_count?: number | null;
	cluster_leaf_capacity?: number | null;
	cluster_target_display_count?: number | null;
	cluster_zoom_bucket?: number | null;
}

export interface ShortestPathRequest {
	source: number;
	target: number;
}

export interface ShortestPathResponse {
	vertex_ids: number[];
	edge_ids: number[];
	total_length: number;
}

export interface TrafficShortestPathResponse extends ShortestPathResponse {
	total_travel_time: number;
}

export interface TrafficStateResponse {
	timestamp: number;
	edges: TrafficEdgeState[];
}

export interface RebuildGraphRequest {
	n_vertices: number;
}

export interface LoadNearbyParams {
	x: number;
	y: number;
	k: number;
	zoom?: number;
}

export interface ApiErrorShape {
	status: number;
	message: string;
}
