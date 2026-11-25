import test from "node:test";
import assert from "node:assert/strict";
import { sharedContacts } from "./projectLinks.ts";
import { departmentGraph } from "./departmentGraph.ts";
import { readFileSync } from "node:fs";
import type { InitiativeData } from "./workspace";
const graph = JSON.parse(
  readFileSync(
    new URL("../../backend/examples/graph.json", import.meta.url),
    "utf8",
  ),
);
const item = (id: string, cid = "company"): InitiativeData => ({
  initiative: { id, companyId: cid, name: id, asOf: graph.asOf },
  graph,
  events: [],
  coverage: {} as InitiativeData["coverage"],
});
test("общие участники определяются по ID в пределах компании, роли остаются проектными", () => {
  const a = item("a"),
    b = item("b");
  b.graph = {
    ...graph,
    nodes: [
      { ...graph.nodes[0], role: { code: "OTHER", label: "Другая роль" } },
      { ...graph.nodes[1], id: "another-id" },
    ],
  };
  const shared = sharedContacts(a, b);
  assert.equal(shared.length, 1);
  assert.equal(shared[0].person.id, graph.nodes[0].id);
  assert.equal(shared[0].other.role?.code, "OTHER");
  assert.deepEqual(sharedContacts(a, item("b", "other-company")), []);
  assert.deepEqual(sharedContacts(a, a), []);
});
test("карта отделов сохраняет направление, число межотдельных связей и признак проверки", () => {
  const original = structuredClone(graph);
  const groups = departmentGraph(graph.nodes, graph.edges);
  assert.deepEqual(graph, original);
  assert.equal(
    groups.nodes.reduce((sum, n) => sum + n.groupSize!, 0),
    graph.nodes.length,
  );
  for (const edge of groups.edges) {
    assert.notEqual(edge.source, edge.target);
    assert.ok(groups.nodes.some((n) => n.id === edge.source));
    assert.ok(groups.nodes.some((n) => n.id === edge.target));
  }
  const a = {
      ...graph.nodes[0],
      id: "a",
      department: { id: "one", name: "Первый" },
    },
    b = {
      ...graph.nodes[0],
      id: "b",
      department: { id: "two", name: "Второй" },
    };
  const mixed = departmentGraph(
    [a, b],
    [
      { ...graph.edges[0], source: "a", target: "b", confirmed: true },
      { ...graph.edges[0], source: "a", target: "b", confirmed: false },
    ],
  );
  assert.equal(mixed.edges.length, 1);
  assert.equal(mixed.edges[0].label, "Связей: 2");
  assert.equal(mixed.edges[0].confirmed, false);
});
