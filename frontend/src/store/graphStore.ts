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

  setView: (view: Partial<ViewState>) => void;
  setHover: (vertexId: number | null) => void;
  clearError: () => void;
  clearSelection: () => void;
  selectVertex: (vertexId: number) => void;

  loadMeta: () => Promise<void>;
  loadNearby: (params: LoadNearbyParams) => Promise<void>;
  computeShortestPath: () => Promise<void>;
}

const initialGraph: GraphData = {
  vertices: [],
  edges: [],
  vertexIds: [],
  incidentEdgeCount: 0,
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

function clampZoom(value: number): number {
  return Math.max(120, Math.min(5000, value));
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

  loadNearby: async (params) => {
    const requestId = get().request.nearbyRequestId + 1;

    set((state) => ({
      request: { ...state.request, nearbyRequestId: requestId },
      network: { ...state.network, loadingNearby: true, error: null },
      selection: initialSelection,
      path: null,
      hover: { vertexId: null },
    }));

    try {
      const nearby = await graphApi.getNearby(params);
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
