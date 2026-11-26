type LabelBox = { x: number; y: number; width: number; height: number };
type LabelAnchor = { x: number; y: number; radius: number };

function overlaps(a: LabelBox, b: LabelBox) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function labelBox(
  anchor: LabelAnchor,
  width: number,
  height: number,
  viewport: { width: number; height: number },
  occupied: LabelBox[],
  important: boolean,
  vertical = false,
): LabelBox | null {
  const { x, y, radius } = anchor;
  const gap = radius + 6;
  const offsets = important ? [0, 14, 30, 52, 82, 120, 170] : [0];
  let fallback: LabelBox | null = null;
  let fallbackCount = Infinity;
  for (const offset of offsets) {
    const distance = gap + offset;
    const options = [
      { x: x + distance, y: y - height / 2 },
      { x: x - distance - width, y: y - height / 2 },
      { x: x - width / 2, y: y + distance },
      { x: x - width / 2, y: y - distance - height },
    ];
    if (vertical) options.push(...options.splice(0, 2));
    for (const option of options) {
      const box = {
        x: Math.max(3, Math.min(option.x, viewport.width - width - 3)),
        y: Math.max(3, Math.min(option.y, viewport.height - height - 3)),
        width,
        height,
      };
      const intersections = occupied.reduce(
        (sum, other) => sum + Number(overlaps(box, other)),
        0,
      );
      if (intersections === 0) return box;
      if (important && intersections < fallbackCount) {
        fallback = box;
        fallbackCount = intersections;
      }
    }
  }
  return fallback;
}
