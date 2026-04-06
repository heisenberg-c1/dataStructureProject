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

export interface Edge {
  id: number;
  u: number;
  v: number;
  length: number;
}

export interface NearbyResponse {
  vertex_ids: number[];
  vertices: Vertex[];
  edges: Edge[];
  incident_edge_count: number;
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
}

export interface GraphData {
  vertices: Vertex[];
  edges: Edge[];
  vertexIds: number[];
  incidentEdgeCount: number;
}

export interface LoadNearbyParams {
  x: number;
  y: number;
  k: number;
  zoom?: number;
}
