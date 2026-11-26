import type { GraphNode } from "./graph.ts";

type Point = { x: number; y: number };

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function graphPositions(
  nodes: GraphNode[],
  focusId?: string | null,
): Map<string, Point> {
  const focus = focusId && nodes.find((node) => node.id === focusId);
  if (focus) {
    const others = nodes.filter((node) => node.id !== focus.id);
    const positions = new Map<string, Point>([[focus.id, { x: 0, y: 0 }]]);
    let start = 0;
    for (let ring = 1; start < others.length; ring++) {
      const count = Math.min(6 + 6 * ring, others.length - start);
      for (let offset = 0; offset < count; offset++) {
        const angle = (offset * 2 * Math.PI) / count + ring * 0.31;
        positions.set(others[start + offset].id, {
          x: Math.cos(angle) * ring * 132,
          y: Math.sin(angle) * ring * 103,
        });
      }
      start += count;
    }
    return positions;
  }

  const groups = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    const id = node.groupSize != null ? node.id : (node.department?.id ?? "");
    const group = groups.get(id);
    if (group) group.push(node);
    else groups.set(id, [node]);
  }
  const departments = [...groups.values()];
  const columns = Math.ceil(Math.sqrt(departments.length * 1.45));
  const rows = Math.ceil(departments.length / columns);
  const largest = Math.max(1, ...departments.map((group) => group.length));
  const step = largest === 1 ? 165 : 110 + Math.sqrt(largest) * 57;
  const positions = new Map<string, Point>();
  departments.forEach((group, index) => {
    const row = Math.floor(index / columns);
    const rowSize = Math.min(columns, departments.length - row * columns);
    const column = index % columns;
    const x =
      (column - (rowSize - 1) / 2) * step * 1.13 +
      (rows > 1 && row % 2 ? step * 0.13 : 0);
    const y = (row - (rows - 1) / 2) * step * 0.86;
    group.forEach((person, slot) => {
      const angle = slot * GOLDEN_ANGLE + index * 0.4;
      const radius = Math.sqrt(slot) * (group.length > 30 ? 24 : 32);
      positions.set(person.id, {
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius,
      });
    });
  });
  return positions;
}
