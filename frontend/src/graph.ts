export type GraphNode = {
  id: string;
  name: string;
  jobTitle: string | null;
  department: { id: string; name: string } | null;
  role: { code: string; label: string } | null;
  decisionMaker: boolean;
  influence?: "HIGH" | "MEDIUM" | "LOW" | null;
  influenceBasis?: string | null;
  email?: string | null;
  phone?: string | null;
  mandate?: string | null;
  interest?: string | null;
  sourceLabel?: string | null;
  editVersion?: number;
  groupSize?: number;
  stance?: "SUPPORTS" | "NEUTRAL" | "DOUBTS" | "OPPOSES" | null;
};
export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  confirmed: boolean;
  sourceLabel?: string | null;
};
export type Graph = {
  companyId: string;
  initiativeId: string;
  asOf: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  filters: {
    departments: { id: string; name: string }[];
    roles: { code: string; label: string }[];
  };
};
export type MapFilters = {
  role: string;
  department: string;
  search: string;
  focus: string | null;
  depth?: 1 | 2;
};

export function selectGraph(graph: Graph, filters: MapFilters) {
  const neighbors = neighborhoodIds(graph, filters.focus, filters.depth ?? 1);
  const search = filters.search.trim().toLocaleLowerCase("ru");
  const nodes = graph.nodes.filter(
    (node) =>
      (!filters.focus || neighbors.has(node.id)) &&
      (!filters.role || node.role?.code === filters.role) &&
      (!filters.department || node.department?.id === filters.department) &&
      (!search ||
        [
          node.name,
          node.jobTitle,
          node.department?.name,
          node.role?.label,
        ].some((value) => value?.toLocaleLowerCase("ru").includes(search))),
  );
  const ids = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: graph.edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    ),
  };
}

export function neighborhoodIds(
  graph: Pick<Graph, "nodes" | "edges">,
  focus: string | null,
  depth: 1 | 2 = 1,
) {
  const ids = new Set<string>();
  if (!focus || !graph.nodes.some((node) => node.id === focus)) return ids;
  ids.add(focus);
  let frontier = new Set([focus]);
  for (let step = 0; step < depth; step++) {
    const next = new Set<string>();
    for (const edge of graph.edges) {
      if (frontier.has(edge.source) && !ids.has(edge.target))
        next.add(edge.target);
      if (frontier.has(edge.target) && !ids.has(edge.source))
        next.add(edge.source);
    }
    for (const id of next) ids.add(id);
    frontier = next;
  }
  return ids;
}
