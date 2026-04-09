import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Application, Container, Graphics } from "pixi.js";

export interface PixiGraphicsLayers {
  edges: Graphics | null;
  vertexHalos: Graphics | null;
  vertices: Graphics | null;
  vertexRings: Graphics | null;
  pathEdges: Graphics | null;
  pathVerticesOutline: Graphics | null;
  pathVertices: Graphics | null;
}

const EMPTY_LAYERS: PixiGraphicsLayers = {
  edges: null,
  vertexHalos: null,
  vertices: null,
  vertexRings: null,
  pathEdges: null,
  pathVerticesOutline: null,
  pathVertices: null,
};

export function usePixiApp(containerRef: RefObject<HTMLDivElement | null>) {
  const appRef = useRef<Application | null>(null);
  const interactionContainerRef = useRef<Container | null>(null);
  const layersRef = useRef<PixiGraphicsLayers>(EMPTY_LAYERS);
  const [runtime, setRuntime] = useState<{
    app: Application | null;
    interactionContainer: Container | null;
    layers: PixiGraphicsLayers;
  }>({
    app: null,
    interactionContainer: null,
    layers: EMPTY_LAYERS,
  });

  useEffect(() => {
    const host = containerRef.current;
    if (!host || appRef.current) {
      return;
    }

    const appInstance = new Application({
      resizeTo: host,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      backgroundAlpha: 0,
    });

    const canvas = appInstance.view as HTMLCanvasElement;
    canvas.style.display = "block";
    canvas.style.touchAction = "none";
    host.appendChild(canvas);

    const interactionContainerInstance = new Container();

    const edges = new Graphics();
    const vertexHalos = new Graphics();
    const vertices = new Graphics();
    const vertexRings = new Graphics();
    const pathEdges = new Graphics();
    const pathVerticesOutline = new Graphics();
    const pathVertices = new Graphics();

    appInstance.stage.addChild(interactionContainerInstance);
    interactionContainerInstance.addChild(edges);
    interactionContainerInstance.addChild(pathEdges);
    interactionContainerInstance.addChild(vertexHalos);
    interactionContainerInstance.addChild(vertices);
    interactionContainerInstance.addChild(vertexRings);
    interactionContainerInstance.addChild(pathVerticesOutline);
    interactionContainerInstance.addChild(pathVertices);

    appRef.current = appInstance;
    interactionContainerRef.current = interactionContainerInstance;
    layersRef.current = {
      edges,
      vertexHalos,
      vertices,
      vertexRings,
      pathEdges,
      pathVerticesOutline,
      pathVertices,
    };
    setRuntime({
      app: appInstance,
      interactionContainer: interactionContainerInstance,
      layers: layersRef.current,
    });

    return () => {
      edges.destroy();
      vertexHalos.destroy();
      vertices.destroy();
      vertexRings.destroy();
      pathEdges.destroy();
      pathVerticesOutline.destroy();
      pathVertices.destroy();
      interactionContainerInstance.destroy({ children: false });
      appInstance.destroy(true, true);

      layersRef.current = EMPTY_LAYERS;
      interactionContainerRef.current = null;
      appRef.current = null;
    };
  }, [containerRef]);

  return runtime;
}
