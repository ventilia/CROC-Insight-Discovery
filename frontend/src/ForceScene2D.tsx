import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import {
  adjacentIds,
  createForceData,
  endpointId,
  rememberPositions,
  type SceneNode,
  type SceneLink,
  type SceneProps,
} from "./forceGraph";

export default function ForceScene2D(props: SceneProps) {
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
    if (!ref || !nodes.length) return;
    ref.zoomToFit(0, Math.min(width, height) * 0.2);
    ref.zoom(Math.min(2.2, Math.max(0.12, ref.zoom())), 0);
  }, [nodes.length, width, height]);
  useEffect(() => {
    const ref = graph.current;
    ref?.d3Force("charge")?.strength(-230);
    ref?.d3Force("link")?.distance(125);
    autoFit.current = true;
    const frame = requestAnimationFrame(fit);
    return () => {
      cancelAnimationFrame(frame);
      rememberPositions(data, positions);
    };
  }, [data, fit, positions]);
  useEffect(() => {
    if (!paused) graph.current?.d3ReheatSimulation();
  }, [paused]);
  useEffect(() => {
    controls.current = {
      fit,
      zoom: (factor) => {
        const ref = graph.current;
        if (ref)
          ref.zoom(Math.max(0.12, Math.min(6, ref.zoom() * factor)), 150);
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
  const linked = (link: SceneLink) =>
    !active ||
    endpointId(link.source) === active ||
    endpointId(link.target) === active;
  return (
    <ForceGraph2D<SceneNode, SceneLink>
      ref={graph}
      width={width}
      height={height}
      graphData={data}
      backgroundColor={dark ? "#101512" : "#fbfcfb"}
      minZoom={0.12}
      maxZoom={6}
      nodeLabel={() => ""}
      linkLabel={() => ""}
      nodeVal={(node) => (node.radius / 4) ** 2}
      nodeCanvasObject={(node, ctx, scale) => {
        const emphasized = !neighbors || neighbors.has(node.id),
          radius = node.radius;
        ctx.save();
        ctx.globalAlpha = emphasized ? 1 : 0.2;
        if (node.id === active) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 5 / scale, 0, Math.PI * 2);
          ctx.fillStyle = dark ? "#ffffff15" : "#16745416";
          ctx.fill();
          ctx.lineWidth = 1.5 / scale;
          ctx.strokeStyle = color(node);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color(node);
        ctx.fill();
        ctx.lineWidth = 1.5 / scale;
        ctx.strokeStyle = dark ? "#dce7deb0" : "#fff";
        ctx.stroke();
        if (
          labels &&
          (nodes.length <= 45 || scale > 1.2 || node.id === active)
        ) {
          const font = Math.min(15, 12 / scale);
          ctx.font = `${node.id === active ? 600 : 400} ${font}px Arial`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.lineWidth = 3 / scale;
          ctx.strokeStyle = dark ? "#101512" : "#fbfcfb";
          ctx.strokeText(node.name, node.x, node.y + radius + 7 / scale);
          ctx.fillStyle = dark ? "#dce7de" : "#334c40";
          ctx.fillText(node.name, node.x, node.y + radius + 7 / scale);
        }
        ctx.restore();
      }}
      nodePointerAreaPaint={(node, paint, ctx, scale) => {
        ctx.fillStyle = paint;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 6 / scale, 0, 2 * Math.PI);
        ctx.fill();
      }}
      linkColor={(link) =>
        !link.confirmed
          ? linked(link)
            ? "#bd9144"
            : dark
              ? "#594b34"
              : "#dbcdb4"
          : active && linked(link)
            ? dark
              ? "#91c66a"
              : "#397e5a"
            : dark
              ? "#506a57"
              : "#c7d3cb"
      }
      linkWidth={(link) => (active && linked(link) ? 2 : 1)}
      linkLineDash={(link) => (link.confirmed ? [] : [5, 4])}
      linkDirectionalArrowLength={5}
      linkDirectionalArrowRelPos={0.85}
      linkHoverPrecision={7}
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
