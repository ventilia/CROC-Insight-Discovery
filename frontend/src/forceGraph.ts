import type { GraphEdge, GraphNode } from "./graph.ts";
import { graphPositions } from "./graphLayout.ts";

export type SceneNode = GraphNode & {
  radius: number;
  x: number;
  y: number;
  z: number;
  homeX: number;
  homeY: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
  fz?: number;
};
export type SceneLink = Omit<GraphEdge, "source" | "target"> & {
  source: string | SceneNode;
  target: string | SceneNode;
};
export type SceneData = { nodes: SceneNode[]; links: SceneLink[] };
export type PositionCache = Map<
  string,
  { x: number; y: number; z: number; fx?: number; fy?: number; fz?: number }
>;
export type ColorMode = "role" | "department";
export type SceneControls = {
  fit: () => void;
  zoom: (factor: number) => void;
  reset: () => void;
};
export type SceneProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  selectedId: string | null;
  hoveredId?: string | null;
  focusId?: string | null;
  edgeSubset?: ReadonlySet<string>;
  hoverLinksOnly?: boolean;
  selectedEdgeId?: string | null;
  revealAdjacent?: boolean;
  dark: boolean;
  labels: boolean;
  paused: boolean;
  color: (node: GraphNode) => string;
  positions: PositionCache;
  controls: { current: SceneControls | null };
  onSelect: (id: string) => void;
  onLink: (id: string) => void;
  onHover: (id: string | null) => void;
};

export function endpointId(value: string | SceneNode) {
  return typeof value === "string" ? value : value.id;
}
export function influenceRadius(node: GraphNode) {
  if (node.groupSize != null)
    return Math.min(38, 14 + Math.sqrt(node.groupSize) * 3);
  return { HIGH: 12, MEDIUM: 9, LOW: 7 }[node.influence ?? "LOW"] ?? 7;
}
export const roleColors: Record<string, string> = {
  BUDGET_APPROVER: "#9163bc",
  PROJECT_SPONSOR: "#36836b",
  TECHNICAL_EXPERT: "#538cc5",
  CONSULTANT: "#b99843",
  PROCUREMENT_LEAD: "#af6b8d",
};
export const departmentColors = [
  "#568fc0",
  "#9067b5",
  "#3b947c",
  "#bb9650",
  "#b56c8a",
  "#6d96a0",
  "#8687bc",
  "#b78264",
];
export function edgeStroke(type: string, confirmed: boolean, dark: boolean) {
  if (!confirmed) return dark ? "#e1ba67" : "#8b5d0a";
  if (type === "APPROVAL") return dark ? "#76b0eb" : "#2869a5";
  if (type === "COORDINATION") return dark ? "#77c6a2" : "#297a54";
  if (type === "EXPERTISE") return dark ? "#e1a174" : "#994823";
  return dark ? "#a2bfae" : "#56766a";
}
export function nodeColor(
  node: GraphNode,
  mode: ColorMode,
  departments: string[],
) {
  if (mode === "role") return roleColors[node.role?.code ?? ""] ?? "#8998a3";
  const index = departments.indexOf(node.department?.id ?? "");
  return index < 0
    ? "#8998a3"
    : departmentColors[index % departmentColors.length];
}

export function createForceData(
  nodes: GraphNode[],
  edges: GraphEdge[],
  cache: PositionCache,
  focusId?: string | null,
): SceneData {
  const ids = new Set(nodes.map((node) => node.id));
  const positions = graphPositions(nodes, focusId);
  return {
    nodes: nodes.map((node, index) => {
      const point = positions.get(node.id)!;
      const saved = cache.get(node.id);
      const position = !focusId || saved?.fx != null ? saved : undefined;
      return {
        ...node,
        radius: influenceRadius(node),
        x: point.x,
        y: point.y,
        homeX: point.x,
        homeY: point.y,
        z: Math.sin(index * 1.9) * 28,
        ...position,
      };
    }),
    // The force engine replaces source/target IDs and adds coordinates: never pass API records directly.
    links: edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map((edge) => ({ ...edge })),
  };
}
export function rememberPositions(data: SceneData, cache: PositionCache) {
  for (const node of data.nodes) {
    if (Number.isFinite(node.x) && Number.isFinite(node.y))
      cache.set(node.id, {
        x: node.x,
        y: node.y,
        z: Number.isFinite(node.z) ? node.z : 0,
        ...(Number.isFinite(node.fx) ? { fx: node.fx } : {}),
        ...(Number.isFinite(node.fy) ? { fy: node.fy } : {}),
        ...(Number.isFinite(node.fz) ? { fz: node.fz } : {}),
      });
  }
}
export function adjacentIds(id: string | null, edges: GraphEdge[]) {
  if (!id) return null;
  const ids = new Set([id]);
  for (const edge of edges) {
    if (edge.source === id) ids.add(edge.target);
    if (edge.target === id) ids.add(edge.source);
  }
  return ids;
}

export function neighborhoodEdgeIds(focusId: string, edges: GraphEdge[]) {
  const nearby = adjacentIds(focusId, edges)!;
  const links = new Set<string>();
  const bridges = new Map<string, GraphEdge>();
  for (const edge of edges) {
    if (edge.source === focusId || edge.target === focusId) {
      links.add(edge.id);
      continue;
    }
    const fromNearby = nearby.has(edge.source);
    if (fromNearby === nearby.has(edge.target)) continue;
    const other = fromNearby ? edge.target : edge.source;
    const previous = bridges.get(other);
    if (!previous || (edge.confirmed && !previous.confirmed))
      bridges.set(other, edge);
  }
  for (const edge of bridges.values()) links.add(edge.id);
  return links;
}
