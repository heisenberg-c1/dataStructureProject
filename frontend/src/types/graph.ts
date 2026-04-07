export interface Bounds {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
}

export interface GraphMetaResponse {
  n_vertices: number;
  n_edges: number;
  bounds: Bounds;
}

export interface Vertex {
  id: number;
  x: number;
  y: number;
}

export type CongestionLevel = "green" | "yellow" | "red";

export type PathMode = "compare" | "static" | "traffic";

export type TrafficTransportMode = "off" | "websocket" | "polling";

export type TrafficConnectionState = "idle" | "connecting" | "open" | "reconnecting" | "polling" | "closed";

export interface TrafficEdgeState {
  id: number;
  capacity_v: number;
  vehicle_count_n: number;
  load_ratio: number;
  dynamic_travel_time: number;
  congestion_level: CongestionLevel;
}

export interface Edge {
  id: number;
  u: number;
  v: number;
  length: number;
  aggregated_count?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  capacity_v?: number;
  vehicle_count_n?: number;
  load_ratio?: number;
  dynamic_travel_time?: number;
  congestion_level?: CongestionLevel;
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
}

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

export interface ApiErrorShape {
  status: number;
  message: string;
}

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

export interface PathData {
  vertexIds: number[];
  edgeIds: number[];
  totalLength: number;
  mode: Exclude<PathMode, "compare">;
  totalTravelTime: number | null;
}

export interface GraphData {
  vertices: Vertex[];
  edges: Edge[];
  vertexIds: number[];
  incidentEdgeCount: number;
  cluster: ClusterInfo;
}

export interface LoadNearbyParams {
  x: number;
  y: number;
  k: number;
  zoom?: number;
}
