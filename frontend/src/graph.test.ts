import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { edgeLine, layoutGraph, nodeWidth, selectGraph, type Graph } from "./graph.ts";

const graph: Graph = JSON.parse(readFileSync(new URL("../../backend/examples/graph.json", import.meta.url), "utf8"));
const all = { role: "", department: "", search: "", focus: null };

test("сценарий защиты: найти бюджетного ЛПР и раскрыть входящую связь", () => {
  const filtered = selectGraph(graph, { ...all, role: "BUDGET_APPROVER" });
  assert.deepEqual(filtered.nodes.map((node) => node.name), ["Марина Орлова"]);
  assert.equal(filtered.edges.length, 0);
  const focused = selectGraph(graph, { ...all, focus: filtered.nodes[0].id });
  assert.deepEqual(focused.nodes.map((node) => node.name), ["Марина Орлова", "Александр Волков"]);
  assert.equal(focused.edges[0].target, filtered.nodes[0].id);
  assert.equal(focused.edges[0].label, "Передаёт расчёт затрат на согласование");
});

test("роль, отдел и поиск сочетаются, связи не выходят за видимый набор", () => {
  const visible = selectGraph(graph, { ...all, department: graph.nodes[0].department!.id, search: "  ОРЛОВА  " });
  assert.equal(visible.nodes.length, 1);
  assert.equal(visible.edges.length, 0);
  assert.equal(selectGraph(graph, { ...all, role: "BUDGET_APPROVER", search: "Волков" }).nodes.length, 0);
  assert.equal(selectGraph(graph, { ...all, search: "Никита" }).nodes[0].role, null);
  assert.equal(selectGraph(graph, all).edges.filter((edge) => !edge.confirmed).length, 1);
});

test("стрелка следует source → target и не заканчивается внутри карточек", () => {
  const layout = layoutGraph(graph.nodes);
  const forward = edgeLine({ x: 0, y: 0 }, { x: 344, y: 0 })!;
  const reverse = edgeLine({ x: 344, y: 0 }, { x: 0, y: 0 })!;
  assert.ok(forward.x1 > nodeWidth && forward.x2 < 344);
  assert.ok(forward.x1 < forward.x2);
  assert.deepEqual([reverse.x1, reverse.x2], [forward.x2, forward.x1]);
  assert.equal(layout.positions.size, graph.nodes.length);
});
