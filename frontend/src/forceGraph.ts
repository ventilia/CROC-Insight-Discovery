import type { GraphEdge, GraphNode } from "./graph.ts";

export type SceneNode = GraphNode & {
  radius: number;
  x: number;
  y: number;
  z: number;
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
): SceneData {
  const ids = new Set(nodes.map((node) => node.id));
  return {
    nodes: nodes.map((node, index) => {
      const angle = index * 2.39996323,
        distance = 55 + Math.sqrt(index + 1) * 32;
      return {
        ...node,
        radius: influenceRadius(node),
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        z: Math.sin(index * 1.9) * distance * 0.45,
        ...cache.get(node.id),
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
