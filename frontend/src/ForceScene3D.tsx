import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, { type ForceGraphMethods } from "react-force-graph-3d";
import {
  CanvasTexture,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Object3D,
} from "three";
import {
  adjacentIds,
  createForceData,
  endpointId,
  rememberPositions,
  type SceneNode,
  type SceneLink,
  type SceneProps,
} from "./forceGraph";

export default function ForceScene3D(props: SceneProps) {
  const {
    nodes,
    edges,
    positions,
    width,
    height,
    dark,
    labels,
    paused,
    selectedId,
    controls,
    color,
    onSelect,
    onLink,
    onHover,
  } = props;
  const graph = useRef<ForceGraphMethods<SceneNode, SceneLink> | undefined>(
    undefined,
  );
  const sprites = useRef(new Map<string, Sprite>());
  const blanks = useRef(new Map<string, Object3D>());
  const autoFit = useRef(true);
  const [hover, setHover] = useState<string | null>(null),
    [revision, setRevision] = useState(0);
  const data = useMemo(
    () => createForceData(nodes, edges, positions),
    [nodes, edges, positions, revision],
  );
  const active = hover ?? props.hoveredId ?? selectedId,
    neighbors = useMemo(() => adjacentIds(active, edges), [active, edges]);
  const fit = useCallback(() => {
    const ref = graph.current;
    if (!ref || !data.nodes.length) return;
    const points = data.nodes;
    const xs = points.map((node) => node.x),
      ys = points.map((node) => node.y),
      zs = points.map((node) => node.z ?? 0);
    const xmin = Math.min(...xs),
      xmax = Math.max(...xs),
      ymin = Math.min(...ys),
      ymax = Math.max(...ys),
      zmin = Math.min(...zs),
      zmax = Math.max(...zs);
    const center = {
      x: (xmin + xmax) / 2,
      y: (ymin + ymax) / 2,
      z: (zmin + zmax) / 2,
    };
    const fov = (ref.camera() as { fov?: number }).fov ?? 50;
    const tangent = Math.tan((fov * Math.PI) / 360);
    const distance =
      Math.max(
        (ymax - ymin + 90) / (2 * tangent),
        (xmax - xmin + 130) / ((2 * tangent * width) / height),
      ) +
      (zmax - zmin) / 2 +
      45;
    ref.cameraPosition(
      { x: center.x, y: center.y, z: center.z + Math.max(160, distance) },
      center,
      0,
    );
  }, [data, width, height]);
  useEffect(() => {
    graph.current?.d3Force("charge")?.strength(-170);
    graph.current?.d3Force("link")?.distance(105);
    autoFit.current = true;
    const frame = requestAnimationFrame(fit);
    return () => {
      cancelAnimationFrame(frame);
      rememberPositions(data, positions);
    };
  }, [data, fit, width, height, positions]);
  useEffect(() => {
    if (!paused) graph.current?.d3ReheatSimulation();
  }, [paused]);
  useEffect(() => {
    const cache = sprites.current;
    return () => {
      for (const sprite of cache.values()) {
        sprite.material.map?.dispose();
        sprite.material.dispose();
      }
      cache.clear();
    };
  }, []);
  useEffect(() => {
    controls.current = {
      fit,
      zoom: (factor) => {
        const ref = graph.current;
        if (!ref) return;
        const camera = ref.camera();
        // Keep the current orbit target while moving toward/away from it.
        const target = (
          ref.controls() as { target?: { x: number; y: number; z: number } }
        ).target ?? { x: 0, y: 0, z: 0 };
        ref.cameraPosition(
          {
            x: target.x + (camera.position.x - target.x) / factor,
            y: target.y + (camera.position.y - target.y) / factor,
            z: target.z + (camera.position.z - target.z) / factor,
          },
          target,
          150,
        );
      },
      reset: () => {
        positions.clear();
        setRevision((value) => value + 1);
      },
    };
    return () => {
      controls.current = null;
    };
  }, [controls, fit, positions]);
  function label(node: SceneNode) {
    const key = node.id + (dark ? ":dark" : ":light");
    let sprite = sprites.current.get(key);
    if (!labels || (nodes.length > 45 && node.id !== active)) {
      if (sprite) {
        sprite.visible = false;
        return sprite;
      }
      if (!blanks.current.has(node.id))
        blanks.current.set(node.id, new Object3D());
      return blanks.current.get(node.id)!;
    }
    if (!sprite) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 64;
      const ctx = canvas.getContext("2d")!;
      ctx.font = "32px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = dark ? "#dce7de" : "#355141";
      ctx.fillText(node.name, 256, 32, 500);
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      sprite = new Sprite(
        new SpriteMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
        }),
      );
      sprite.scale.set(208, 26, 1);
      sprites.current.set(key, sprite);
    }
    sprite.position.y = node.radius + 17;
    sprite.visible = labels && (nodes.length <= 45 || node.id === active);
    sprite.material.opacity = !neighbors || neighbors.has(node.id) ? 1 : 0.18;
    return sprite;
  }
  const linked = (link: SceneLink) =>
    !active ||
    endpointId(link.source) === active ||
    endpointId(link.target) === active;
  return (
    <ForceGraph3D<SceneNode, SceneLink>
      ref={graph}
      graphData={data}
      width={width}
      height={height}
      backgroundColor={dark ? "#101512" : "#fbfcfb"}
      showNavInfo={false}
      controlType="orbit"
      nodeLabel={() => ""}
      linkLabel={() => ""}
      nodeRelSize={4}
      nodeVal={(node) =>
        ((node.radius * (node.id === active ? 1.15 : 1)) / 4) ** 3
      }
      nodeColor={(node) =>
        neighbors && !neighbors.has(node.id)
          ? dark
            ? "#314136"
            : "#d1dad4"
          : color(node)
      }
      nodeOpacity={0.95}
      nodeResolution={16}
      nodeThreeObject={label}
      nodeThreeObjectExtend={true}
      linkColor={(link) =>
        !link.confirmed
          ? "#bd9144"
          : active && linked(link)
            ? "#4b9b73"
            : dark
              ? "#708d77"
              : "#a4b7aa"
      }
      linkWidth={(link) => (active && linked(link) ? 1.2 : 0.5)}
      linkOpacity={0.6}
      linkDirectionalArrowLength={5}
      linkDirectionalArrowRelPos={0.88}
      cooldownTicks={paused ? 0 : 130}
      warmupTicks={45}
      d3VelocityDecay={0.35}
      onNodeHover={(node) => {
        setHover(node?.id ?? null);
        onHover(node?.id ?? null);
      }}
      onNodeClick={(node) => onSelect(node.id)}
      onLinkClick={(link) => onLink(link.id)}
      onNodeDragEnd={(node) => {
        node.fx = node.x;
        node.fy = node.y;
        node.fz = node.z;
        rememberPositions(data, positions);
      }}
      onEngineStop={() => {
        rememberPositions(data, positions);
        if (autoFit.current) {
          autoFit.current = false;
          fit();
        }
      }}
    />
  );
}
