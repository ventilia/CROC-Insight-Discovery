import type { GraphNode, GraphEdge } from "./graph";
export function departmentGraph(nodes: GraphNode[], edges: GraphEdge[]) {
  const groups = new Map<string, GraphNode>(),
    membership = new Map<string, string>();
  for (const person of nodes) {
    const id = "department:" + (person.department?.id ?? "unassigned");
    membership.set(person.id, id);
    if (!groups.has(id))
      groups.set(id, {
        id,
        name: person.department?.name ?? "Без подразделения",
        jobTitle: null,
        role: null,
        decisionMaker: false,
        department: person.department ?? null,
        groupSize: 0,
      });
    const group = groups.get(id)!;
    group.groupSize = (group.groupSize ?? 0) + 1;
  }
  const links = new Map<string, GraphEdge>();
  const counts = new Map<string, number>();
  for (const edge of edges) {
    const source = membership.get(edge.source),
      target = membership.get(edge.target);
    if (!source || !target || source === target) continue;
    const key = JSON.stringify([source, target]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const previous = links.get(key);
    links.set(key, {
      id: key,
      source,
      target,
      type: "DEPARTMENT",
      label: `Связей: ${counts.get(key)}`,
      confirmed: edge.confirmed && (previous?.confirmed ?? true),
    });
  }
  return {
    nodes: [...groups.values()].map((g) => ({
      ...g,
      name: `${g.name} · ${g.groupSize}`,
    })),
    edges: [...links.values()],
  };
}
