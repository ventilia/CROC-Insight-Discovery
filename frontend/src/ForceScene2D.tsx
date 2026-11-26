import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { getContactPortrait } from "./ContactPortrait";
import { labelBox } from "./graphLabels";
import {
  adjacentIds,
  createForceData,
  edgeStroke,
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
    focusId,
    edgeSubset,
    hoverLinksOnly,
    selectedEdgeId,
    revealAdjacent,
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
  const labelTargets = useRef<
    { id: string; box: NonNullable<ReturnType<typeof labelBox>> }[]
  >([]);
  const [hover, setHover] = useState<string | null>(null);
  const [hoverLink, setHoverLink] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [portraitImages, setPortraitImages] = useState<
    Record<string, HTMLImageElement>
  >({});
  const lockedLayout = nodes.every((node) => node.groupSize != null);
  const data = useMemo(
    () => createForceData(nodes, edges, positions, focusId),
    [nodes, edges, positions, focusId, revision],
  );
  const hoveredNode = hover ?? props.hoveredId;
  const active = hoveredNode ?? selectedId;
  const neighbors = useMemo(() => adjacentIds(active, edges), [active, edges]);
  const portraitSources = useMemo(
    () =>
      [
        ...new Set(
          nodes.flatMap((node) => {
            const portrait = node.decisionMaker && getContactPortrait(node.id);
            return portrait ? [portrait.src] : [];
          }),
        ),
      ]
        .sort()
        .join("|"),
    [nodes],
  );
  const sortedLabels = useMemo(() => {
    const priority = (node: SceneNode) =>
      node.id === active
        ? 0
        : node.decisionMaker
          ? 1
          : node.groupSize != null
            ? 2
            : 3;
    return [...data.nodes].sort(
      (left, right) => priority(left) - priority(right),
    );
  }, [data, active]);
  const curves = useMemo(() => {
    const pairs = new Map<string, string[]>();
    const key = (from: string, to: string) => JSON.stringify([from, to]);
    for (const edge of edges) {
      const code = key(edge.source, edge.target);
      const ids = pairs.get(code);
      if (ids) ids.push(edge.id);
      else pairs.set(code, [edge.id]);
    }
    return new Map(
      edges.map((edge) => {
        const parallel = pairs.get(key(edge.source, edge.target)) ?? [];
        const reversed = pairs.has(key(edge.target, edge.source));
        const base = reversed ? 0.16 : 0;
        return [
          edge.id,
          base + (parallel.length > 1 ? parallel.indexOf(edge.id) * 0.09 : 0),
        ];
      }),
    );
  }, [edges]);
  const fit = useCallback(() => {
    const ref = graph.current;
    if (!ref || !nodes.length) return;
    ref.zoomToFit(
      0,
      Math.min(width, height) * (nodes.length > 35 ? 0.09 : 0.13),
    );
    if (ref.zoom() > 2.1) ref.zoom(2.1, 0);
  }, [nodes.length, width, height]);

  useEffect(() => {
    let cancelled = false;
    for (const src of portraitSources.split("|").filter(Boolean)) {
      const image = new Image();
      image.onload = () => {
        if (!cancelled)
          setPortraitImages((previous) => ({ ...previous, [src]: image }));
      };
      image.src = src;
    }
    return () => {
      cancelled = true;
    };
  }, [portraitSources]);
  useEffect(() => {
    const ref = graph.current;
    if (ref) {
      ref.d3Force("center", null);
      ref
        .d3Force("charge")
        ?.strength(focusId || nodes.length > 140 ? -62 : -140);
      const link = ref.d3Force("link");
      link?.distance((edge: SceneLink) => {
        const from = edge.source;
        const to = edge.target;
        if (typeof from === "string" || typeof to === "string") return 90;
        return Math.max(
          85,
          Math.hypot(from.homeX - to.homeX, from.homeY - to.homeY),
        );
      });
      link?.strength(focusId ? 0.11 : nodes.length > 140 ? 0.08 : 0.16);
      ref.d3Force("positions", (alpha) => {
        const strength = alpha * (focusId || nodes.length > 140 ? 0.39 : 0.25);
        for (const node of data.nodes) {
          node.vx = (node.vx ?? 0) + (node.homeX - node.x) * strength;
          node.vy = (node.vy ?? 0) + (node.homeY - node.y) * strength;
        }
      });
      if (!paused && !lockedLayout) ref.d3ReheatSimulation();
    }
    autoFit.current = true;
    const frame = requestAnimationFrame(fit);
    return () => {
      cancelAnimationFrame(frame);
      rememberPositions(data, positions);
    };
  }, [data, fit, focusId, lockedLayout, nodes.length, paused, positions]);
  useEffect(() => {
    controls.current = {
      fit,
      zoom: (factor) => {
        const ref = graph.current;
        if (ref)
          ref.zoom(
            Math.max(0.08, Math.min(6, ref.zoom() * factor)),
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

  const highlights = (link: SceneLink) =>
    link.id === selectedEdgeId ||
    link.id === hoverLink ||
    (!!active &&
      (endpointId(link.source) === active ||
        endpointId(link.target) === active));
  const visibleLink = (link: SceneLink) => {
    if (hoverLinksOnly) {
      return !!hoveredNode &&
        (endpointId(link.source) === hoveredNode || endpointId(link.target) === hoveredNode);
    }
    return !edgeSubset ||
      edgeSubset.has(link.id) ||
      link.id === selectedEdgeId ||
      (!!revealAdjacent && highlights(link));
  };
  const curvature = (link: SceneLink) => curves.get(link.id) ?? 0;
  const linkColor = (link: SceneLink) =>
    edgeStroke(link.type, link.confirmed, dark);

  function drawArrows(
    link: SceneLink,
    ctx: CanvasRenderingContext2D,
    scale: number,
  ) {
    const { source, target } = link;
    if (typeof source === "string" || typeof target === "string") return;
    const dx = target.x - source.x,
      dy = target.y - source.y;
    const distance = Math.hypot(dx, dy);
    const highlighted = highlights(link);
    const arrowLength = (highlighted ? 13 : 9) / scale;
    if (distance < source.radius + target.radius + arrowLength * 1.5) return;
    const fraction = Math.max(
      0.52,
      Math.min(0.79, 1 - (target.radius + 5 / scale) / distance),
    );
    const remaining = 1 - fraction;
    const bend = curvature(link);
    const cx = (source.x + target.x) / 2 + dy * bend;
    const cy = (source.y + target.y) / 2 - dx * bend;
    const tipX =
      remaining * remaining * source.x +
      2 * remaining * fraction * cx +
      fraction * fraction * target.x;
    const tipY =
      remaining * remaining * source.y +
      2 * remaining * fraction * cy +
      fraction * fraction * target.y;
    const angle = Math.atan2(
      remaining * (cy - source.y) + fraction * (target.y - cy),
      remaining * (cx - source.x) + fraction * (target.x - cx),
    );
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.globalAlpha = highlighted || !active ? 1 : 0.58;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-arrowLength, -arrowLength * 0.43);
    ctx.lineTo(-arrowLength * 0.78, 0);
    ctx.lineTo(-arrowLength, arrowLength * 0.43);
    ctx.closePath();
    ctx.strokeStyle = dark ? "#101612" : "#f8fbf9";
    ctx.lineWidth = 2.2 / scale;
    ctx.stroke();
    ctx.fillStyle = linkColor(link);
    ctx.fill();
    ctx.restore();
  }

  function drawLabels(ctx: CanvasRenderingContext2D, scale: number) {
    const ref = graph.current;
    if (!ref) return;
    const occupied: NonNullable<ReturnType<typeof labelBox>>[] = [];
    const targets: typeof labelTargets.current = [];
    for (const node of data.nodes) {
      if (node.groupSize == null) continue;
      const { x, y } = ref.graph2ScreenCoords(node.x, node.y);
      const radius = node.radius * scale;
      occupied.push({
        x: x - radius,
        y: y - radius,
        width: 2 * radius,
        height: 2 * radius,
      });
    }
    const pixelRatio = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.textBaseline = "middle";
    for (const node of sortedLabels) {
      const selected = node.id === active;
      const important =
        selected || node.decisionMaker || node.groupSize != null;
      if (
        !important &&
        (!labels ||
          (nodes.length > 36 && scale < 0.8 && !neighbors?.has(node.id)))
      )
        continue;
      const { x, y } = ref.graph2ScreenCoords(node.x, node.y);
      const radius = node.radius * scale;
      if (
        x < -radius ||
        y < -radius ||
        x > width + radius ||
        y > height + radius
      )
        continue;

      const font = important ? 13 : 11;
      ctx.font = `${important ? 700 : 500} ${font}px Arial, sans-serif`;
      const text = node.name;
      const textWidth = Math.min(width - 20, ctx.measureText(text).width);
      const box = labelBox(
        { x, y, radius },
        textWidth + 10,
        font + 6,
        { width, height },
        occupied,
        important,
        node.groupSize != null,
      );
      if (!box) continue;
      occupied.push(box);
      targets.push({ id: node.id, box });
      if (important) {
        const anchorX = Math.max(box.x + 4, Math.min(x, box.x + box.width - 4));
        const anchorY = Math.max(
          box.y + 3,
          Math.min(y, box.y + box.height - 3),
        );
        if (Math.hypot(anchorX - x, anchorY - y) > radius + 15) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(anchorX, anchorY);
          ctx.lineWidth = 1;
          ctx.strokeStyle = dark ? "#89a293" : "#667e73";
          ctx.stroke();
        }
        ctx.fillStyle = dark ? "#1b2922" : "#edf5ef";
        ctx.fillRect(box.x, box.y, box.width, box.height);
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = dark ? "#101612" : "#f8fbf9";
      if (!important)
        ctx.strokeText(text, box.x + 5, box.y + box.height / 2, textWidth);
      ctx.fillStyle =
        node.decisionMaker || selected
          ? dark
            ? "#d6f0ba"
            : "#16482f"
          : dark
            ? "#d7e4dc"
            : "#283f35";
      ctx.fillText(text, box.x + 5, box.y + box.height / 2, textWidth);
    }
    labelTargets.current = targets;
    ctx.restore();
  }

  function openLabel(event: MouseEvent) {
    if (!(event.target instanceof HTMLCanvasElement)) return false;
    const bounds = event.target.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const target = labelTargets.current.find(
      ({ box }) =>
        x >= box.x &&
        x <= box.x + box.width &&
        y >= box.y &&
        y <= box.y + box.height,
    );
    if (!target) return false;
    (onOpen ?? onSelect)(target.id);
    return true;
  }

  return (
    <ForceGraph2D<SceneNode, SceneLink>
      ref={graph}
      width={width}
      height={height}
      graphData={data}
      backgroundColor="rgba(0, 0, 0, 0)"
      minZoom={0.08}
      maxZoom={6}
      nodeLabel={() => ""}
      linkLabel={() => ""}
      nodeVal={(node) => (node.radius / 4) ** 2}
      nodeCanvasObject={(node, ctx, scale) => {
        const important = node.decisionMaker || node.id === active;
        const emphasized = important || !neighbors || neighbors.has(node.id);
        const radius = node.radius;
        const visibleRadius = Math.max(
          radius,
          (important ? 3.8 : 2.25) / scale,
        );
        ctx.save();
        ctx.globalAlpha = emphasized ? 1 : 0.52;
        if (important) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, visibleRadius + 3.5 / scale, 0, Math.PI * 2);
          ctx.lineWidth = 1.7 / scale;
          ctx.strokeStyle =
            node.id === active
              ? dark
                ? "#ecf4dc"
                : "#183b2e"
              : dark
                ? "#b6d895"
                : "#356747";
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(node.x, node.y, visibleRadius, 0, Math.PI * 2);
        ctx.fillStyle = color(node);
        ctx.fill();
        const portrait = node.decisionMaker && getContactPortrait(node.id);
        const image = portrait && portraitImages[portrait.src];
        if (portrait && image && visibleRadius * scale >= 7) {
          const tileWidth = image.naturalWidth / portrait.columns;
          const tileHeight = image.naturalHeight / portrait.rows;
          ctx.save();
          ctx.clip();
          ctx.drawImage(
            image,
            (portrait.index % portrait.columns) * tileWidth,
            Math.floor(portrait.index / portrait.columns) * tileHeight,
            tileWidth,
            tileHeight,
            node.x - visibleRadius,
            node.y - visibleRadius,
            visibleRadius * 2,
            visibleRadius * 2,
          );
          ctx.restore();
        }
        ctx.lineWidth = 1 / scale;
        ctx.strokeStyle = dark ? "#b9ccbe" : "#fdfefd";
        ctx.stroke();
        ctx.restore();
      }}
      nodePointerAreaPaint={(node, paint, ctx, scale) => {
        ctx.fillStyle = paint;
        ctx.beginPath();
        ctx.arc(
          node.x,
          node.y,
          Math.max(node.radius, 4 / scale) + 5 / scale,
          0,
          2 * Math.PI,
        );
        ctx.fill();
      }}
      linkVisibility={visibleLink}
      linkColor={(link) =>
        linkColor(link) + (highlights(link) ? "ff" : active ? "4d" : "82")
      }
      linkWidth={(link) => (highlights(link) ? 2.1 : 1)}
      linkCurvature={curvature}
      linkCanvasObjectMode={() => "after"}
      linkCanvasObject={drawArrows}
      linkLineDash={(link) => (link.confirmed ? [] : [5, 4])}
      linkHoverPrecision={7}
      showPointerCursor={(object) => !!object}
      onRenderFramePost={drawLabels}
      cooldownTicks={paused || lockedLayout ? 0 : 90}
      warmupTicks={paused || lockedLayout ? 0 : 34}
      d3VelocityDecay={0.42}
      onNodeHover={(node) => {
        setHover(node?.id ?? null);
        onHover(node?.id ?? null);
      }}
      onNodeClick={(node) => (onOpen ?? onSelect)(node.id)}
      onBackgroundClick={(event) => {
        openLabel(event);
      }}
      onLinkClick={(link, event) => {
        if (!openLabel(event)) onLink(link.id);
      }}
      onLinkHover={(link) => setHoverLink(link?.id ?? null)}
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
