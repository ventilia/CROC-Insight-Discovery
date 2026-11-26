import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  createForceData,
  endpointId,
  influenceRadius,
  nodeColor,
  rememberPositions,
  type PositionCache,
} from "./forceGraph.ts";
import type { Graph } from "./graph.ts";
import { labelBox } from "./graphLabels.ts";
const graph: Graph = JSON.parse(
  readFileSync(
    new URL("../../backend/examples/graph.json", import.meta.url),
    "utf8",
  ),
);

test("force engine меняет копии узлов и связей, исходные API-данные остаются прежними", () => {
  const original = structuredClone(graph);
  graph.nodes.forEach(Object.freeze);
  graph.edges.forEach(Object.freeze);
  const scene = createForceData(graph.nodes, graph.edges, new Map());
  scene.nodes[0].x += 100;
  scene.nodes[0].fx = scene.nodes[0].x;
  scene.links[0].target = scene.nodes[0];
  assert.deepEqual(graph, original);
  assert.equal(endpointId(scene.links[0].target), graph.nodes[0].id);
});
test("перемещённый узел сохраняет положение при фильтрации и возвращении", () => {
  const cache: PositionCache = new Map();
  const scene = createForceData(graph.nodes, graph.edges, cache);
  scene.nodes[0].x = 71;
  scene.nodes[0].y = -32;
  scene.nodes[0].fx = 71;
  scene.nodes[0].fy = -32;
  rememberPositions(scene, cache);
  const filtered = createForceData([graph.nodes[0]], graph.edges, cache);
  assert.equal(filtered.nodes[0].x, 71);
  assert.equal(filtered.nodes[0].fy, -32);
  assert.equal(filtered.links.length, 0);
});
test("влияние берётся из источника, цвет роли и отдела не зависит от раскладки", () => {
  assert.ok(
    influenceRadius({ ...graph.nodes[0], influence: "HIGH" }) >
      influenceRadius({ ...graph.nodes[0], influence: "LOW" }),
  );
  assert.equal(
    influenceRadius({ ...graph.nodes[0], influence: null }),
    influenceRadius({ ...graph.nodes[0], influence: "LOW" }),
  );
  assert.notEqual(
    nodeColor(graph.nodes[0], "role", []),
    nodeColor(graph.nodes[1], "role", []),
  );
  assert.equal(nodeColor(graph.nodes[3], "department", []), "#8998a3");
});
test("карта на 480 человек не теряет связи и не создаёт несуществующие", () => {
  const nodes = Array.from({ length: 480 }, (_, index) => ({
    ...graph.nodes[index % 4],
    id: String(index),
  }));
  const edges = Array.from({ length: 579 }, (_, index) => ({
    ...graph.edges[0],
    id: String(index),
    source: String(index % 480),
    target: String((index * 7 + 1) % 480),
  }));
  const scene = createForceData(nodes, edges, new Map());
  assert.equal(scene.nodes.length, 480);
  assert.equal(scene.links.length, 579);
  assert.ok(
    scene.nodes.every(
      (node) =>
        Number.isFinite(node.x) &&
        Number.isFinite(node.y) &&
        Number.isFinite(node.z),
    ),
  );
  assert.equal(new Set(scene.nodes.map((node) => node.id)).size, 480);
});

test("подсветка охватывает только ближайших соседей в обоих направлениях", async () => {
  const { adjacentIds } = await import("./forceGraph.ts");
  const edge = graph.edges[0];
  const edges = [
    { ...edge, source: "a", target: "b" },
    { ...edge, id: "2", source: "c", target: "a" },
    { ...edge, id: "3", source: "b", target: "d" },
  ];
  assert.deepEqual(adjacentIds("a", edges), new Set(["a", "b", "c"]));
  assert.equal(adjacentIds(null, edges), null);
});

test("окружение фиксирует центр и разводит участников по нескольким кольцам", () => {
  const nodes = Array.from({ length: 40 }, (_, index) => ({
    ...graph.nodes[index % 4],
    id: String(index),
  }));
  const scene = createForceData(nodes, [], new Map(), "7");
  const center = scene.nodes.find((node) => node.id === "7")!;
  assert.deepEqual([center.x, center.y], [0, 0]);
  const normalizedDistance = (node: typeof center) =>
    Math.round(Math.hypot(node.x / 132, node.y / 103));
  assert.deepEqual(
    [...new Set(scene.nodes.map(normalizedDistance))].sort(),
    [0, 1, 2, 3],
  );
});

test("подпись ЛПР находит место за пределами занятых соседних подписей", () => {
  const anchor = { x: 200, y: 150, radius: 8 };
  const viewport = { width: 420, height: 300 };
  const occupied = [{ x: 96, y: 70, width: 204, height: 156 }];
  assert.equal(labelBox(anchor, 80, 18, viewport, occupied, false), null);
  const required = labelBox(anchor, 80, 18, viewport, occupied, true)!;
  assert.ok(
    required.x >= 300 ||
      required.x + required.width <= 96 ||
      required.y >= 226 ||
      required.y + required.height <= 70,
  );
});

test("окружение оставляет прямые связи и проверенную связь на каждого участника второго шага", async () => {
  const { neighborhoodEdgeIds } = await import("./forceGraph.ts");
  const relation = graph.edges[0];
  const edges = [
    { ...relation, id: "direct-a", source: "focus", target: "a" },
    { ...relation, id: "direct-b", source: "b", target: "focus" },
    { ...relation, id: "unconfirmed-bridge", source: "a", target: "c", confirmed: false },
    { ...relation, id: "confirmed-bridge", source: "c", target: "b", confirmed: true },
    { ...relation, id: "direct-crosslink", source: "a", target: "b" },
    { ...relation, id: "second-crosslink", source: "c", target: "d" },
    { ...relation, id: "other-bridge", source: "a", target: "d" },
  ];
  assert.deepEqual(
    neighborhoodEdgeIds("focus", edges),
    new Set(["direct-a", "direct-b", "confirmed-bridge", "other-bridge"]),
  );
});
