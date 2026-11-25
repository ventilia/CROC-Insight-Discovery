import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { neighborhoodIds, selectGraph, type Graph } from "./graph.ts";

const graph: Graph = JSON.parse(
  readFileSync(
    new URL("../../backend/examples/graph.json", import.meta.url),
    "utf8",
  ),
);
const all = { role: "", department: "", search: "", focus: null };

test("сценарий защиты: найти бюджетного ЛПР и раскрыть входящую связь", () => {
  const filtered = selectGraph(graph, { ...all, role: "BUDGET_APPROVER" });
  assert.deepEqual(
    filtered.nodes.map((node) => node.name),
    ["Марина Орлова"],
  );
  assert.equal(filtered.edges.length, 0);
  const focused = selectGraph(graph, { ...all, focus: filtered.nodes[0].id });
  assert.deepEqual(
    focused.nodes.map((node) => node.name),
    ["Марина Орлова", "Александр Волков"],
  );
  assert.equal(focused.edges[0].target, filtered.nodes[0].id);
  assert.equal(
    focused.edges[0].label,
    "Передаёт расчёт затрат на согласование",
  );
});

test("роль, отдел и поиск сочетаются, связи не выходят за видимый набор", () => {
  const visible = selectGraph(graph, {
    ...all,
    department: graph.nodes[0].department!.id,
    search: "  ОРЛОВА  ",
  });
  assert.equal(visible.nodes.length, 1);
  assert.equal(visible.edges.length, 0);
  assert.equal(
    selectGraph(graph, { ...all, role: "BUDGET_APPROVER", search: "Волков" })
      .nodes.length,
    0,
  );
  assert.equal(
    selectGraph(graph, { ...all, search: "Никита" }).nodes[0].role,
    null,
  );
  assert.equal(
    selectGraph(graph, all).edges.filter((edge) => !edge.confirmed).length,
    1,
  );
});

test("два шага включают входящие связи, не меняя их направления", () => {
  const marina = graph.nodes[0].id;
  const focused = selectGraph(graph, { ...all, focus: marina, depth: 2 });
  assert.deepEqual(
    focused.nodes.map((node) => node.name),
    ["Марина Орлова", "Александр Волков", "Дарья Белова"],
  );
  assert.deepEqual(focused.edges, graph.edges);
  assert.equal(neighborhoodIds(graph, "missing", 2).size, 0);
  assert.equal(
    selectGraph(graph, { ...all, focus: graph.nodes[3].id, depth: 2 }).nodes
      .length,
    1,
  );
});
