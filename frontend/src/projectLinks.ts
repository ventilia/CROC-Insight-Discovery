import type { InitiativeData } from "./workspace";
export function sharedContacts(a: InitiativeData, b: InitiativeData) {
  if (
    a.initiative.companyId !== b.initiative.companyId ||
    a.initiative.id === b.initiative.id
  )
    return [];
  const other = new Map(b.graph.nodes.map((p) => [p.id, p]));
  return a.graph.nodes
    .filter((p) => other.has(p.id))
    .map((person) => ({ person, other: other.get(person.id)! }));
}
