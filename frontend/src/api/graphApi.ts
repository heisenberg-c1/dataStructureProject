import { httpClient, normalizeApiError } from "@/api/http";
import type {
  GraphMetaResponse,
  LoadNearbyParams,
  NearbyResponse,
  ShortestPathRequest,
  ShortestPathResponse,
  TrafficShortestPathResponse,
  TrafficStateResponse,
} from "@/types/graph";

export class GraphApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function toGraphApiError(error: unknown): GraphApiError {
  const normalized = normalizeApiError(error);
  return new GraphApiError(normalized.status, normalized.message);
}

export const graphApi = {
  async getMeta(signal?: AbortSignal): Promise<GraphMetaResponse> {
    try {
      const response = await httpClient.get<GraphMetaResponse>("/graph/meta", { signal });
      return response.data;
    } catch (error) {
      throw toGraphApiError(error);
    }
  },

  async getNearby(params: LoadNearbyParams, signal?: AbortSignal): Promise<NearbyResponse> {
    try {
      const response = await httpClient.get<NearbyResponse>("/graph/nearby", {
        params,
        signal,
      });
      return response.data;
    } catch (error) {
      throw toGraphApiError(error);
    }
  },

  async postShortestPath(payload: ShortestPathRequest, signal?: AbortSignal): Promise<ShortestPathResponse> {
    try {
      const response = await httpClient.post<ShortestPathResponse>("/graph/shortest-path", payload, {
        signal,
      });
      return response.data;
    } catch (error) {
      throw toGraphApiError(error);
    }
  },

  async postTrafficShortestPath(payload: ShortestPathRequest, signal?: AbortSignal): Promise<TrafficShortestPathResponse> {
    try {
      const response = await httpClient.post<TrafficShortestPathResponse>("/graph/shortest-path/traffic", payload, {
        signal,
      });
      return response.data;
    } catch (error) {
      throw toGraphApiError(error);
    }
  },

  async getTrafficState(signal?: AbortSignal): Promise<TrafficStateResponse> {
    try {
      const response = await httpClient.get<TrafficStateResponse>("/graph/traffic/state", { signal });
      return response.data;
    } catch (error) {
      throw toGraphApiError(error);
    }
  },
};
