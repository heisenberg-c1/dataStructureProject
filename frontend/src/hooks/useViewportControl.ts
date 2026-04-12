import { useEffect } from "react";
import type { MutableRefObject } from "react";
import { Application, Container } from "pixi.js";

import { getViewZoomMax, useGraphStore, VIEW_ZOOM_MIN } from "@/store/graphStore";
import type { Vertex, ViewState } from "@/types";
import { screenToWorld } from "@/utils/coor";
import {
  HOVER_PICK_THRESHOLD,
  SELECT_PICK_THRESHOLD,
  pickNearestVertex,
  type VertexKDTreeIndex,
} from "@/utils/picking";
import { debounce, throttle } from "@/utils/throttle";

const HOVER_THROTTLE_MS = 16;
const HOVER_COMMIT_THROTTLE_MS = 60;
const VIEW_COMMIT_DEBOUNCE_MS = 90;

interface UseViewportControlParams {
  app: Application | null;
  interactionContainer: Container | null;
  verticesRef: MutableRefObject<Vertex[]>;
  spatialIndexRef: MutableRefObject<VertexKDTreeIndex | null>;
  committedViewRef: MutableRefObject<ViewState>;
  interactionViewRef: MutableRefObject<ViewState>;
}

export function useViewportControl({
  app,
  interactionContainer,
  verticesRef,
  spatialIndexRef,
  committedViewRef,
  interactionViewRef,
}: UseViewportControlParams): void {
  useEffect(() => {
    if (!app || !interactionContainer || interactionContainer.destroyed) {
      return;
    }

    const canvas = app.view as HTMLCanvasElement;
    let disposed = false;

    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    let hoverKnownId: number | null = useGraphStore.getState().hover.vertexId;

    const applyTransientTransform = (baseView: ViewState, nextView: ViewState) => {
      if (disposed || interactionContainer.destroyed) {
        return;
      }

      const scale = nextView.zoom / baseView.zoom;
      const baseCenterX = app.screen.width / 2 + baseView.panX;
      const baseCenterY = app.screen.height / 2 + baseView.panY;
      const nextCenterX = app.screen.width / 2 + nextView.panX;
      const nextCenterY = app.screen.height / 2 + nextView.panY;

      interactionContainer.scale.set(scale, scale);
      interactionContainer.position.set(
        nextCenterX - scale * baseCenterX,
        nextCenterY - scale * baseCenterY,
      );
    };

    const commitInteractionView = () => {
      const nextView = interactionViewRef.current;
      const currentView = useGraphStore.getState().view;
      if (
        nextView.zoom === currentView.zoom &&
        nextView.panX === currentView.panX &&
        nextView.panY === currentView.panY
      ) {
        return;
      }
      useGraphStore.getState().setView(nextView);
    };

    const throttledCommitHover = throttle((vertexId: number | null) => {
      const current = useGraphStore.getState().hover.vertexId;
      if (current === vertexId) {
        return;
      }
      useGraphStore.getState().setHover(vertexId);
    }, HOVER_COMMIT_THROTTLE_MS);

    const throttledHoverPick = throttle((localX: number, localY: number) => {
      const nearest = pickNearestVertex(
        localX,
        localY,
        verticesRef.current,
        interactionViewRef.current,
        app.screen.width,
        app.screen.height,
        HOVER_PICK_THRESHOLD,
        spatialIndexRef.current,
      );
      if (nearest === hoverKnownId) {
        return;
      }
      hoverKnownId = nearest;
      throttledCommitHover(nearest);
    }, HOVER_THROTTLE_MS);

    const debouncedCommitView = debounce(() => {
      commitInteractionView();
    }, VIEW_COMMIT_DEBOUNCE_MS);

    const onPointerDown = (event: PointerEvent) => {
      if (disposed || interactionContainer.destroyed) {
        return;
      }

      dragging = true;
      moved = false;
      lastX = event.clientX;
      lastY = event.clientY;
      debouncedCommitView.cancel();
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (disposed || interactionContainer.destroyed) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      throttledHoverPick(localX, localY);

      if (!dragging) {
        return;
      }

      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        moved = true;
      }

      const current = interactionViewRef.current;
      const next = {
        ...current,
        panX: current.panX + dx,
        panY: current.panY + dy,
      };
      interactionViewRef.current = next;
      applyTransientTransform(committedViewRef.current, next);

      lastX = event.clientX;
      lastY = event.clientY;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (disposed || interactionContainer.destroyed) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;

      if (!moved) {
        const nearest = pickNearestVertex(
          localX,
          localY,
          verticesRef.current,
          interactionViewRef.current,
          app.screen.width,
          app.screen.height,
          SELECT_PICK_THRESHOLD,
          spatialIndexRef.current,
        );
        if (nearest != null) {
          useGraphStore.getState().selectVertex(nearest);
        }
      } else {
        debouncedCommitView.cancel();
        commitInteractionView();
      }

      dragging = false;
      moved = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const onPointerLeave = () => {
      if (disposed) {
        return;
      }

      throttledHoverPick.cancel();
      throttledCommitHover.cancel();
      dragging = false;
      moved = false;
      debouncedCommitView.cancel();
      commitInteractionView();
      hoverKnownId = null;
      useGraphStore.getState().setHover(null);
    };

    const onWheel = (event: WheelEvent) => {
      if (disposed || interactionContainer.destroyed) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.currentTarget !== canvas) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;

      const current = interactionViewRef.current;
      const direction = event.deltaY > 0 ? 0.9 : 1.1;
      const maxZoom = getViewZoomMax();
      const nextZoom = Math.max(VIEW_ZOOM_MIN, Math.min(maxZoom, current.zoom * direction));

      if (nextZoom === current.zoom) {
        return;
      }

      const world = screenToWorld(sx, sy, current, app.screen.width, app.screen.height);
      const nextPanX = sx - app.screen.width / 2 - (world.x - 0.5) * nextZoom;
      const nextPanY = sy - app.screen.height / 2 - (world.y - 0.5) * nextZoom;

      interactionViewRef.current = {
        zoom: nextZoom,
        panX: nextPanX,
        panY: nextPanY,
      };
      applyTransientTransform(committedViewRef.current, interactionViewRef.current);
      debouncedCommitView();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      disposed = true;

      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);

      throttledHoverPick.cancel();
      throttledCommitHover.cancel();
      debouncedCommitView.cancel();
    };
  }, [app, committedViewRef, interactionContainer, interactionViewRef, spatialIndexRef, verticesRef]);
}
