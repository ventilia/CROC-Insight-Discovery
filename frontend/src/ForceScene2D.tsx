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

export default function ForceScene2D(
  props: SceneProps & { onOpen?: (id: string) => void },
) {
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
    onOpen,
    onLink,
    onHover,
  } = props;
  const graph = useRef<ForceGraphMethods<SceneNode, SceneLink> | undefined>(
    undefined,
  );
  const autoFit = useRef(true);
  const zoomScale = useRef(1);
  const lastPress = useRef<{
    id: string;
    time: number;
    x: number;
    y: number;
  } | null>(null);
  const [hover, setHover] = useState<string | null>(null),
    [hoverLink, setHoverLink] = useState<string | null>(null),
    [revision, setRevision] = useState(0);
  const data = useMemo(
    () => createForceData(nodes, edges, positions),
    [nodes, edges, positions, revision],
  );
  const active = hover ?? props.hoveredId ?? selectedId,
    neighbors = useMemo(() => adjacentIds(active, edges), [active, edges]);
  const curvedEdges = useMemo(() => {
    const pairs = new Set(
      edges.map(({ source, target }) => JSON.stringify([source, target])),
    );
    return new Set(
      edges
        .filter(({ source, target }) =>
          pairs.has(JSON.stringify([target, source])),
        )
        .map(({ id }) => id),
    );
  }, [edges]);
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
          ref.zoom(
            Math.max(0.12, Math.min(6, ref.zoom() * factor)),
            paused ? 0 : 150,
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
  }, [controls, fit, paused, positions]);
  const linked = (link: SceneLink) =>
    !active ||
    endpointId(link.source) === active ||
    endpointId(link.target) === active;
  const curvature = (link: SceneLink) => (curvedEdges.has(link.id) ? 0.2 : 0);
  function openNode(node: SceneNode, event: MouseEvent) {
    const previous = lastPress.current;
    const mouse = "pointerType" in event && event.pointerType === "mouse";
    if (
      onOpen &&
      mouse &&
      previous?.id === node.id &&
      event.timeStamp - previous.time < 425 &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 8
    ) {
      lastPress.current = null;
      onOpen(node.id);
      return;
    }
    lastPress.current = mouse
      ? {
          id: node.id,
          time: event.timeStamp,
          x: event.clientX,
          y: event.clientY,
        }
      : null;
    onSelect(node.id);
  }
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
        if (active && neighbors?.has(node.id)) {
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
          (nodes.length <= 45 || scale > 1.2 || (active && emphasized))
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
              : "#87998d"
      }
      linkWidth={(link) => (active && linked(link) ? 2 : 1)}
      linkCurvature={curvature}
      linkCanvasObjectMode={() => "after"}
      linkCanvasObject={(link, ctx, scale) => {
        if (
          !labels ||
          !(
            nodes.length <= 30 ||
            (active && linked(link)) ||
            link.id === hoverLink
          )
        )
          return;
        if (typeof link.source === "string" || typeof link.target === "string")
          return;
        const from = link.source,
          to = link.target;
        const dx = to.x - from.x,
          dy = to.y - from.y;
        const length = Math.hypot(dx, dy);
        if (length < from.radius + to.radius + 20) return;
        let angle = Math.atan2(dy, dx);
        if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
        const offset = curvature(link) / 2;
        ctx.save();
        ctx.translate(
          (from.x + to.x) / 2 + dy * offset,
          (from.y + to.y) / 2 - dx * offset,
        );
        ctx.rotate(angle);
        ctx.globalAlpha = active && !linked(link) ? 0.18 : 1;
        const font = Math.min(14, 11 / scale);
        ctx.font = `${font}px Arial`;
        const available = Math.max(24, length - from.radius - to.radius - 20);
        let label = link.label;
        while (
          label.length > 1 &&
          ctx.measureText(label + "…").width > available
        )
          label = label.slice(0, -1);
        if (label !== link.label) label += "…";
        const width = ctx.measureText(label).width;
        ctx.fillStyle = dark ? "#101512" : "#fbfcfb";
        ctx.fillRect(
          -width / 2 - 3 / scale,
          -font - 5 / scale,
          width + 6 / scale,
          font + 4 / scale,
        );
        ctx.fillStyle = !link.confirmed
          ? dark
            ? "#dfbc7a"
            : "#906b2d"
          : dark
            ? "#bdcbbf"
            : "#50655a";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(label, 0, -3 / scale);
        ctx.restore();
      }}
      linkLineDash={(link) => (link.confirmed ? [] : [5, 4])}
      linkDirectionalArrowLength={(link) => {
        const { source, target } = link;
        if (typeof source === "string" || typeof target === "string") return 0;
        const gap =
          Math.hypot(target.x - source.x, target.y - source.y) -
          source.radius -
          target.radius;
        return Math.max(
          0,
          Math.min(
            (active && linked(link) ? 13 : nodes.length > 200 ? 6 : 10) /
              zoomScale.current,
            gap / 3,
          ),
        );
      }}
      linkDirectionalArrowColor={(link) => {
        if (active && !linked(link)) return dark ? "#69796e" : "#8a9a8e";
        if (!link.confirmed) return dark ? "#dfbc7a" : "#906b2d";
        return active
          ? dark
            ? "#b9e290"
            : "#2d6d4d"
          : dark
            ? "#93ad99"
            : "#526e5c";
      }}
      linkDirectionalArrowRelPos={0.89}
      linkHoverPrecision={7}
      cooldownTicks={paused ? 0 : 130}
      warmupTicks={45}
      d3VelocityDecay={0.35}
      onNodeHover={(node) => {
        setHover(node?.id ?? null);
        onHover(node?.id ?? null);
      }}
      onNodeClick={openNode}
      onLinkClick={(link) => onLink(link.id)}
      onLinkHover={(link) => setHoverLink(link?.id ?? null)}
      onZoom={({ k }) => {
        zoomScale.current = k;
      }}
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
