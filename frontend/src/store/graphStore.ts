import { create } from "zustand";

import { toGraphData, toPathData } from "@/bridge/graphBridge";
import { graphApi } from "@/api/graphApi";
import type {
  GraphData,
  GraphMetaResponse,
  LoadNearbyParams,
  PathData,
  SelectionState,
  ViewState,
} from "@/types/graph";

interface NetworkState {
  loadingMeta: boolean;
  loadingNearby: boolean;
  loadingPath: boolean;
  error: string | null;
}

interface RequestState {
  nearbyRequestId: number;
  pathRequestId: number;
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
  selection: SelectionState;
  view: ViewState;
  hover: HoverState;
  network: NetworkState;
  request: RequestState;
  lastNearbyQuery: NearbyQueryState | null;

  setView: (view: Partial<ViewState>) => void;
  setHover: (vertexId: number | null) => void;
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

export const useGraphStore = create<GraphStoreState>((set, get) => ({
  meta: null,
  graph: initialGraph,
  path: null,
  selection: initialSelection,
  view: initialView,
  hover: { vertexId: null },
  network: {
    loadingMeta: false,
    loadingNearby: false,
    loadingPath: false,
    error: null,
  },
  request: {
    nearbyRequestId: 0,
    pathRequestId: 0,
  },
  lastNearbyQuery: null,

  setView: (viewPatch) => {
    set((state) => ({
      view: {
        zoom: clampZoom(viewPatch.zoom ?? state.view.zoom),
        panX: viewPatch.panX ?? state.view.panX,
        panY: viewPatch.panY ?? state.view.panY,
      },
    }));
  },

  setHover: (vertexId) => {
    set(() => ({ hover: { vertexId } }));
  },

  clearError: () => {
    set((state) => ({ network: { ...state.network, error: null } }));
  },

  clearSelection: () => {
    set(() => ({
      selection: initialSelection,
      path: null,
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
      const message = error instanceof Error ? error.message : "Failed to load meta";
      set((state) => ({
        network: { ...state.network, loadingMeta: false, error: message },
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
      hover: preserveSelection ? state.hover : { vertexId: null },
    }));

    try {
      const nearby = await graphApi.getNearby(requestParams);
      if (get().request.nearbyRequestId !== requestId) {
        return;
      }
      set((state) => ({
        graph: toGraphData(nearby),
        network: { ...state.network, loadingNearby: false },
      }));
    } catch (error) {
      if (get().request.nearbyRequestId !== requestId) {
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to load nearby graph";
      set((state) => ({
        network: { ...state.network, loadingNearby: false, error: message },
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
      const rawPath = await graphApi.postShortestPath({
        source: state.selection.sourceVertexId,
        target: state.selection.targetVertexId,
      });
      if (get().request.pathRequestId !== requestId) {
        return;
      }
      set((prev) => ({
        path: toPathData(rawPath),
        network: { ...prev.network, loadingPath: false },
      }));
    } catch (error) {
      if (get().request.pathRequestId !== requestId) {
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to compute shortest path";
      set((prev) => ({
        network: { ...prev.network, loadingPath: false, error: message },
      }));
    }
  },
}));
