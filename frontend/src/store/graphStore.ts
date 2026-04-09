import { create } from "zustand";

import { toGraphData, toPathData, toTrafficEdgeMap } from "@/bridge/graphBridge";
import { graphApi } from "@/api/graphApi";
import { TrafficWsClient } from "@/api/trafficWsClient";
import type {
  Edge,
  GraphData,
  GraphMetaResponse,
  LoadNearbyParams,
  PathMode,
  PathData,
  SelectionState,
  TrafficConnectionState,
  TrafficEdgeState,
  TrafficStateResponse,
  TrafficTransportMode,
  ViewState,
} from "@/types";

interface NetworkState {
  loadingMeta: boolean;
  loadingNearby: boolean;
  loadingPath: boolean;
  loadingTraffic: boolean;
  error: string | null;
}

interface RequestState {
  nearbyRequestId: number;
  pathRequestId: number;
  trafficRequestId: number;
}

interface NearbyQueryState {
  x: number;
  y: number;
  k: number;
}

interface LoadNearbyOptions {
  preserveSelection?: boolean;
}

interface HoverState {
  vertexId: number | null;
}

interface GraphStoreState {
  meta: GraphMetaResponse | null;
  graph: GraphData;
  path: PathData | null;
  staticPath: PathData | null;
  trafficPath: PathData | null;
  pathMode: PathMode;
  trafficTimestamp: number | null;
  trafficEdgesById: Record<number, TrafficEdgeState>;
  trafficPollingEnabled: boolean;
  trafficPollingIntervalMs: number;
  trafficPollingTimerId: number | null;
  trafficTransportMode: TrafficTransportMode;
  trafficConnectionState: TrafficConnectionState;
  trafficLastSeq: number;
  selection: SelectionState;
  view: ViewState;
  hover: HoverState;
  network: NetworkState;
  request: RequestState;
  lastNearbyQuery: NearbyQueryState | null;

  setPathMode: (mode: PathMode) => void;
  setView: (view: Partial<ViewState>) => void;
  setHover: (vertexId: number | null) => void;
  setTrafficPollingEnabled: (enabled: boolean) => void;
  connectTrafficStream: () => Promise<void>;
  disconnectTrafficStream: () => void;
  fetchTrafficState: () => Promise<void>;
  startTrafficPolling: (intervalMs?: number) => void;
  stopTrafficPolling: () => void;
  clearError: () => void;
  clearSelection: () => void;
  selectVertex: (vertexId: number) => void;

  loadMeta: () => Promise<void>;
  loadNearby: (params: LoadNearbyParams, options?: LoadNearbyOptions) => Promise<void>;
  reloadNearbyForCurrentZoom: () => Promise<void>;
  computeShortestPath: () => Promise<void>;
}

const initialGraph: GraphData = {
  vertices: [],
  edges: [],
  vertexIds: [],
  incidentEdgeCount: 0,
  cluster: {
    clustered: false,
    mode: "none",
    rawVertexCount: 0,
    displayVertexCount: 0,
    rawEdgeCount: 0,
    displayEdgeCount: 0,
    mergedEdgeCount: 0,
    threshold: null,
    zoom: null,
    cellSize: null,
    leafCount: null,
  },
};

const initialSelection: SelectionState = {
  phase: "idle",
  sourceVertexId: null,
  targetVertexId: null,
};

const initialView: ViewState = {
  zoom: 900,
  panX: 0,
  panY: 0,
};

export const VIEW_ZOOM_MIN = 120;
export const VIEW_ZOOM_MAX = 12000;

const VIEW_ZOOM_BASE_MAX = 5000;

export function getViewZoomMax(): number {
  if (typeof window === "undefined") {
    return VIEW_ZOOM_BASE_MAX;
  }
  const shortSide = Math.max(1, Math.min(window.innerWidth, window.innerHeight));
  const dpr = window.devicePixelRatio || 1;
  const suggested = Math.round(shortSide * 16 * dpr);
  return Math.max(VIEW_ZOOM_BASE_MAX, Math.min(VIEW_ZOOM_MAX, suggested));
}

function clampZoom(value: number): number {
  return Math.max(VIEW_ZOOM_MIN, Math.min(getViewZoomMax(), value));
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function applyTrafficToEdges(edges: Edge[], trafficEdgesById: Record<number, TrafficEdgeState>): Edge[] {
  return edges.map((edge) => {
    const traffic = trafficEdgesById[edge.id];
    if (!traffic) {
      return edge;
    }
    return {
      ...edge,
      capacity_v: traffic.capacity_v,
      vehicle_count_n: traffic.vehicle_count_n,
      load_ratio: traffic.load_ratio,
      dynamic_travel_time: traffic.dynamic_travel_time,
      congestion_level: traffic.congestion_level,
    };
  });
}

function resolveDisplayedPath(mode: PathMode, staticPath: PathData | null, trafficPath: PathData | null): PathData | null {
  if (mode === "static") {
    return staticPath;
  }
  if (mode === "traffic") {
    return trafficPath;
  }
  return trafficPath ?? staticPath;
}

function applyTrafficSnapshot(
  state: GraphStoreState,
  traffic: TrafficStateResponse,
): Pick<GraphStoreState, "trafficTimestamp" | "trafficEdgesById" | "graph"> {
  const edgesById = toTrafficEdgeMap(traffic);
  return {
    trafficTimestamp: traffic.timestamp,
    trafficEdgesById: edgesById,
    graph: {
      ...state.graph,
      edges: applyTrafficToEdges(state.graph.edges, edgesById),
    },
  };
}

function defaultTrafficWsUrl(): string {
  const explicit = import.meta.env.VITE_TRAFFIC_WS_URL;
  if (typeof explicit === "string" && explicit.length > 0) {
    return explicit;
  }
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
  const wsBase = apiBaseUrl.replace(/^http/i, "ws").replace(/\/$/, "");
  return `${wsBase}/ws/traffic`;
}

let trafficWsClient: TrafficWsClient | null = null;
let manualWsDisconnect = false;

export const useGraphStore = create<GraphStoreState>((set, get) => ({
  meta: null,
  graph: initialGraph,
  path: null,
  staticPath: null,
  trafficPath: null,
  pathMode: "compare",
  trafficTimestamp: null,
  trafficEdgesById: {},
  trafficPollingEnabled: true,
  trafficPollingIntervalMs: 1000,
  trafficPollingTimerId: null,
  trafficTransportMode: "off",
  trafficConnectionState: "idle",
  trafficLastSeq: 0,
  selection: initialSelection,
  view: initialView,
  hover: { vertexId: null },
  network: {
    loadingMeta: false,
    loadingNearby: false,
    loadingPath: false,
    loadingTraffic: false,
    error: null,
  },
  request: {
    nearbyRequestId: 0,
    pathRequestId: 0,
    trafficRequestId: 0,
  },
  lastNearbyQuery: null,

  setPathMode: (mode) => {
    const state = get();
    const nextPath = resolveDisplayedPath(mode, state.staticPath, state.trafficPath);
    set(() => ({ pathMode: mode, path: nextPath }));

    const shouldRecompute =
      state.selection.phase === "pickedAB" &&
      ((mode === "static" && state.staticPath == null) ||
        (mode === "traffic" && state.trafficPath == null) ||
        (mode === "compare" && (state.staticPath == null || state.trafficPath == null)));
    if (shouldRecompute) {
      void get().computeShortestPath();
    }
  },

  setView: (viewPatch) => {
    set((state) => {
      const nextView: ViewState = {
        zoom: clampZoom(viewPatch.zoom ?? state.view.zoom),
        panX: viewPatch.panX ?? state.view.panX,
        panY: viewPatch.panY ?? state.view.panY,
      };

      if (
        nextView.zoom === state.view.zoom &&
        nextView.panX === state.view.panX &&
        nextView.panY === state.view.panY
      ) {
        return state;
      }

      return { view: nextView };
    });
  },

  setHover: (vertexId) => {
    set((state) => {
      if (state.hover.vertexId === vertexId) {
        return state;
      }
      return { hover: { vertexId } };
    });
  },

  setTrafficPollingEnabled: (enabled) => {
    set(() => ({ trafficPollingEnabled: enabled }));
    if (enabled) {
      void get().connectTrafficStream();
      return;
    }
    get().disconnectTrafficStream();
  },

  connectTrafficStream: async () => {
    if (typeof window === "undefined") {
      return;
    }
    if (!get().trafficPollingEnabled) {
      return;
    }
    if (trafficWsClient?.isOpen()) {
      return;
    }

    manualWsDisconnect = false;
    get().stopTrafficPolling();

    set((state) => ({
      trafficTransportMode: "websocket",
      trafficConnectionState: "connecting",
      network: {
        ...state.network,
        error: null,
      },
    }));

    if (trafficWsClient) {
      trafficWsClient.disconnect();
      trafficWsClient = null;
    }

    trafficWsClient = new TrafficWsClient({
      url: defaultTrafficWsUrl(),
      throttleMs: get().trafficPollingIntervalMs,
      onStatus: (status, detail, manual) => {
        if (manual || manualWsDisconnect || !get().trafficPollingEnabled) {
          return;
        }

        if (status === "open") {
          get().stopTrafficPolling();
          set((state) => ({
            trafficTransportMode: "websocket",
            trafficConnectionState: "open",
            network: {
              ...state.network,
              error: null,
            },
          }));
          return;
        }

        if (status === "connecting" || status === "reconnecting") {
          if (get().trafficPollingTimerId == null) {
            get().startTrafficPolling(get().trafficPollingIntervalMs);
          }
          set((state) => ({
            trafficTransportMode: "polling",
            trafficConnectionState: status,
            network: {
              ...state.network,
              error: detail ?? state.network.error,
            },
          }));
          return;
        }

        set((state) => ({
          trafficTransportMode: "polling",
          trafficConnectionState: "closed",
          network: {
            ...state.network,
            error: detail ?? state.network.error,
          },
        }));
        if (get().trafficPollingTimerId == null) {
          get().startTrafficPolling(get().trafficPollingIntervalMs);
        }
      },
      onTrafficState: (traffic, seq) => {
        const state = get();
        if (typeof seq === "number" && seq <= state.trafficLastSeq) {
          return;
        }

        get().stopTrafficPolling();
        set((prev) => ({
          ...applyTrafficSnapshot(prev, traffic),
          trafficLastSeq: typeof seq === "number" ? seq : prev.trafficLastSeq + 1,
          trafficTransportMode: "websocket",
          trafficConnectionState: "open",
          network: {
            ...prev.network,
            loadingTraffic: false,
          },
        }));
      },
      onError: (message) => {
        if (!get().trafficPollingEnabled) {
          return;
        }
        set((state) => ({
          network: {
            ...state.network,
            error: message,
          },
        }));
      },
    });

    try {
      await trafficWsClient.connect();
    } catch (error) {
      if (!get().trafficPollingEnabled) {
        return;
      }
      set((state) => ({
        trafficTransportMode: "polling",
        trafficConnectionState: "closed",
        network: {
          ...state.network,
          error: errorMessage(error, "Traffic websocket unavailable; fallback to polling"),
        },
      }));
      get().startTrafficPolling(get().trafficPollingIntervalMs);
    }
  },

  disconnectTrafficStream: () => {
    manualWsDisconnect = true;
    if (trafficWsClient) {
      trafficWsClient.disconnect();
      trafficWsClient = null;
    }
    get().stopTrafficPolling();
    set((state) => ({
      trafficTransportMode: "off",
      trafficConnectionState: "idle",
      network: {
        ...state.network,
        loadingTraffic: false,
      },
    }));
  },

  startTrafficPolling: (intervalMs) => {
    if (typeof window === "undefined") {
      return;
    }
    const state = get();
    const nextInterval = intervalMs ?? state.trafficPollingIntervalMs;
    if (state.trafficPollingTimerId != null && nextInterval === state.trafficPollingIntervalMs) {
      return;
    }
    if (state.trafficPollingTimerId != null) {
      window.clearInterval(state.trafficPollingTimerId);
    }
    const timerId = window.setInterval(() => {
      void get().fetchTrafficState();
    }, nextInterval);
    set(() => ({
      trafficPollingTimerId: timerId,
      trafficPollingIntervalMs: nextInterval,
      trafficTransportMode: "polling",
      trafficConnectionState: "polling",
    }));
    void get().fetchTrafficState();
  },

  stopTrafficPolling: () => {
    if (typeof window === "undefined") {
      return;
    }
    const timerId = get().trafficPollingTimerId;
    if (timerId != null) {
      window.clearInterval(timerId);
    }
    set(() => ({ trafficPollingTimerId: null }));
  },

  fetchTrafficState: async () => {
    const requestId = get().request.trafficRequestId + 1;
    set((state) => ({
      request: { ...state.request, trafficRequestId: requestId },
      network: { ...state.network, loadingTraffic: true, error: null },
    }));

    try {
      const traffic = await graphApi.getTrafficState();
      if (get().request.trafficRequestId !== requestId) {
        return;
      }
      set((state) => ({
        ...applyTrafficSnapshot(state, traffic),
        network: { ...state.network, loadingTraffic: false },
      }));
    } catch (error) {
      if (get().request.trafficRequestId !== requestId) {
        return;
      }
      set((state) => ({
        network: {
          ...state.network,
          loadingTraffic: false,
          error: errorMessage(error, "Failed to fetch traffic state"),
        },
      }));
    }
  },

  clearError: () => {
    set((state) => ({ network: { ...state.network, error: null } }));
  },

  clearSelection: () => {
    set(() => ({
      selection: initialSelection,
      path: null,
      staticPath: null,
      trafficPath: null,
      hover: { vertexId: null },
    }));
  },

  selectVertex: (vertexId) => {
    const state = get();

    if (state.network.loadingPath) {
      return;
    }

    if (state.selection.phase === "idle") {
      set(() => ({
        selection: {
          phase: "pickedA",
          sourceVertexId: vertexId,
          targetVertexId: null,
        },
        path: null,
        staticPath: null,
        trafficPath: null,
        network: { ...get().network, error: null },
      }));
      return;
    }

    if (state.selection.phase === "pickedA") {
      if (state.selection.sourceVertexId === vertexId) {
        return;
      }
      set(() => ({
        selection: {
          phase: "pickedAB",
          sourceVertexId: state.selection.sourceVertexId,
          targetVertexId: vertexId,
        },
        network: { ...get().network, error: null },
      }));
      void get().computeShortestPath();
      return;
    }

    set(() => ({
      selection: {
        phase: "pickedA",
        sourceVertexId: vertexId,
        targetVertexId: null,
      },
      path: null,
      staticPath: null,
      trafficPath: null,
      network: { ...get().network, error: null },
    }));
  },

  loadMeta: async () => {
    set((state) => ({
      network: { ...state.network, loadingMeta: true, error: null },
    }));
    try {
      const meta = await graphApi.getMeta();
      set((state) => ({
        meta,
        network: { ...state.network, loadingMeta: false },
      }));
    } catch (error) {
      set((state) => ({
        network: {
          ...state.network,
          loadingMeta: false,
          error: errorMessage(error, "Failed to load meta"),
        },
      }));
    }
  },

  loadNearby: async (params, options) => {
    const requestId = get().request.nearbyRequestId + 1;
    const state = get();
    const preserveSelection = Boolean(options?.preserveSelection);
    const query: NearbyQueryState = {
      x: params.x,
      y: params.y,
      k: params.k,
    };
    const requestParams: LoadNearbyParams = {
      ...params,
      zoom: params.zoom ?? state.view.zoom,
    };

    set((state) => ({
      request: { ...state.request, nearbyRequestId: requestId },
      network: { ...state.network, loadingNearby: true, error: null },
      lastNearbyQuery: query,
      selection: preserveSelection ? state.selection : initialSelection,
      path: preserveSelection ? state.path : null,
      staticPath: preserveSelection ? state.staticPath : null,
      trafficPath: preserveSelection ? state.trafficPath : null,
      hover: preserveSelection ? state.hover : { vertexId: null },
    }));

    try {
      const nearby = await graphApi.getNearby(requestParams);
      if (get().request.nearbyRequestId !== requestId) {
        return;
      }
      set((state) => ({
        graph: {
          ...toGraphData(nearby),
          edges: applyTrafficToEdges(toGraphData(nearby).edges, state.trafficEdgesById),
        },
        network: { ...state.network, loadingNearby: false },
      }));
      if (get().trafficTransportMode !== "websocket" && (get().trafficTimestamp == null || !get().trafficPollingEnabled)) {
        void get().fetchTrafficState();
      }
    } catch (error) {
      if (get().request.nearbyRequestId !== requestId) {
        return;
      }
      set((state) => ({
        network: {
          ...state.network,
          loadingNearby: false,
          error: errorMessage(error, "Failed to load nearby graph"),
        },
      }));
    }
  },

  reloadNearbyForCurrentZoom: async () => {
    const state = get();
    if (!state.lastNearbyQuery || state.network.loadingNearby) {
      return;
    }
    await get().loadNearby({
      ...state.lastNearbyQuery,
      zoom: state.view.zoom,
    }, { preserveSelection: true });
  },

  computeShortestPath: async () => {
    const state = get();
    if (state.network.loadingPath) {
      return;
    }
    if (state.selection.phase !== "pickedAB") {
      return;
    }
    if (state.selection.sourceVertexId == null || state.selection.targetVertexId == null) {
      return;
    }

    const requestId = state.request.pathRequestId + 1;
    set((prev) => ({
      request: { ...prev.request, pathRequestId: requestId },
      network: { ...prev.network, loadingPath: true, error: null },
    }));

    try {
      let nextStaticPath = state.staticPath;
      let nextTrafficPath = state.trafficPath;
      const errors: string[] = [];

      if (state.pathMode === "compare") {
        const [staticResult, trafficResult] = await Promise.allSettled([
          graphApi.postShortestPath({
            source: state.selection.sourceVertexId,
            target: state.selection.targetVertexId,
          }),
          graphApi.postTrafficShortestPath({
            source: state.selection.sourceVertexId,
            target: state.selection.targetVertexId,
          }),
        ]);

        if (staticResult.status === "fulfilled") {
          nextStaticPath = toPathData(staticResult.value, "static");
        } else {
          errors.push(errorMessage(staticResult.reason, "Failed to compute static path"));
        }

        if (trafficResult.status === "fulfilled") {
          nextTrafficPath = toPathData(trafficResult.value, "traffic");
        } else {
          errors.push(errorMessage(trafficResult.reason, "Failed to compute traffic path"));
        }
      } else if (state.pathMode === "static") {
        const rawStaticPath = await graphApi.postShortestPath({
          source: state.selection.sourceVertexId,
          target: state.selection.targetVertexId,
        });
        nextStaticPath = toPathData(rawStaticPath, "static");
      } else {
        const rawTrafficPath = await graphApi.postTrafficShortestPath({
          source: state.selection.sourceVertexId,
          target: state.selection.targetVertexId,
        });
        nextTrafficPath = toPathData(rawTrafficPath, "traffic");
      }

      if (get().request.pathRequestId !== requestId) {
        return;
      }

      const nextPath = resolveDisplayedPath(state.pathMode, nextStaticPath, nextTrafficPath);
      const nextError = errors.length > 0 ? errors.join("; ") : null;

      if (!nextPath) {
        set((prev) => ({
          network: {
            ...prev.network,
            loadingPath: false,
            error: nextError ?? "No path found between source and target",
          },
        }));
        return;
      }

      set((prev) => ({
        staticPath: nextStaticPath,
        trafficPath: nextTrafficPath,
        path: nextPath,
        network: {
          ...prev.network,
          loadingPath: false,
          error: nextError,
        },
      }));
    } catch (error) {
      if (get().request.pathRequestId !== requestId) {
        return;
      }
      set((prev) => ({
        network: {
          ...prev.network,
          loadingPath: false,
          error: errorMessage(error, "Failed to compute shortest path"),
        },
      }));
    }
  },
}));
