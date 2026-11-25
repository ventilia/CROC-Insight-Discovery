export type GraphNode = {
  id: string;
  name: string;
  jobTitle: string | null;
  department: { id: string; name: string } | null;
  role: { code: string; label: string } | null;
  decisionMaker: boolean;
};
export type GraphEdge = { id: string; source: string; target: string; type: string; label: string; confirmed: boolean };
export type Graph = {
  companyId: string;
  initiativeId: string;
  asOf: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  filters: { departments: { id: string; name: string }[]; roles: { code: string; label: string }[] };
};
export type MapFilters = { role: string; department: string; search: string; focus: string | null };

export function selectGraph(graph: Graph, filters: MapFilters) {
  const neighbors = new Set([filters.focus]);
  if (filters.focus) {
    for (const edge of graph.edges) {
      if (edge.source === filters.focus) neighbors.add(edge.target);
      if (edge.target === filters.focus) neighbors.add(edge.source);
    }
  }
  const search = filters.search.trim().toLocaleLowerCase("ru");
  const nodes = graph.nodes.filter((node) =>
    (!filters.focus || neighbors.has(node.id)) &&
    (!filters.role || node.role?.code === filters.role) &&
    (!filters.department || node.department?.id === filters.department) &&
    (!search || [node.name, node.jobTitle, node.department?.name, node.role?.label]
      .some((value) => value?.toLocaleLowerCase("ru").includes(search))),
  );
  const ids = new Set(nodes.map((node) => node.id));
  return { nodes, edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) };
}

export const nodeWidth = 228;
export const nodeHeight = 132;

export function layoutGraph(nodes: GraphNode[]) {
  const columns = nodes.length > 4 ? 3 : 2;
  const positions = new Map(nodes.map((node, index) => [node.id, {
    x: 38 + (index % columns) * 344,
    y: 38 + Math.floor(index / columns) * 240,
  }]));
  return {
    positions,
    width: 76 + Math.min(nodes.length, columns) * 344 - 116,
    height: 76 + Math.ceil(nodes.length / columns) * 240 - 108,
  };
}

// Intersect each line with the card boundary so arrows stop outside the cards.
export function edgeLine(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (!dx && !dy) return null;
  const fraction = 1 / Math.max(Math.abs(dx) / (nodeWidth / 2 + 9), Math.abs(dy) / (nodeHeight / 2 + 9));
  return {
    x1: from.x + nodeWidth / 2 + dx * fraction,
    y1: from.y + nodeHeight / 2 + dy * fraction,
    x2: to.x + nodeWidth / 2 - dx * fraction,
    y2: to.y + nodeHeight / 2 - dy * fraction,
  };
}
