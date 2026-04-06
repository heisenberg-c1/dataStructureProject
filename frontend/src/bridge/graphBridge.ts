import type {
  GraphData,
  NearbyResponse,
  PathData,
  ShortestPathResponse,
  Vertex,
} from "@/types/graph";

export function toGraphData(raw: NearbyResponse): GraphData {
  return {
    vertices: raw.vertices,
    edges: raw.edges,
    vertexIds: raw.vertex_ids,
    incidentEdgeCount: raw.incident_edge_count,
  };
}

export function toPathData(raw: ShortestPathResponse): PathData {
  return {
    vertexIds: raw.vertex_ids,
    edgeIds: raw.edge_ids,
    totalLength: raw.total_length,
  };
}

export function findVertexById(vertices: Vertex[], vertexId: number): Vertex | undefined {
  return vertices.find((vertex) => vertex.id === vertexId);
}
