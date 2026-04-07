import type {
  GraphData,
  NearbyResponse,
  PathData,
  ShortestPathResponse,
  Vertex,
} from "@/types/graph";

export function toGraphData(raw: NearbyResponse): GraphData {
  const rawCount = raw.raw_vertex_count ?? raw.vertex_ids.length;
  const displayCount = raw.display_vertex_count ?? raw.vertex_ids.length;
  const rawEdgeCount = raw.raw_edge_count ?? raw.edges.length;
  const displayEdgeCount = raw.display_edge_count ?? raw.edges.length;
  return {
    vertices: raw.vertices,
    edges: raw.edges,
    vertexIds: raw.vertex_ids,
    incidentEdgeCount: raw.incident_edge_count,
    cluster: {
      clustered: Boolean(raw.clustered),
      mode: raw.cluster_mode ?? "none",
      rawVertexCount: rawCount,
      displayVertexCount: displayCount,
      rawEdgeCount,
      displayEdgeCount,
      mergedEdgeCount: raw.merged_edge_count ?? Math.max(0, rawEdgeCount - displayEdgeCount),
      threshold: raw.cluster_threshold ?? null,
      zoom: raw.zoom ?? null,
      cellSize: raw.cluster_cell_size ?? null,
      leafCount: raw.cluster_leaf_count ?? null,
    },
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
