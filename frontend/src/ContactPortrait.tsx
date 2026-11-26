import "./contact-portrait.css";

const original = "/portraits/mockup-leadership.jpg";
const showcase = "/portraits/showcase-leadership.webp";

const portraits: Record<
  string,
  { src: string; index: number; columns: number; rows: number }
> = {
  "40000000-0000-4000-8000-000000000001": {
    src: original,
    index: 0,
    columns: 3,
    rows: 2,
  },
  "40000000-0000-4000-8000-000000000002": {
    src: original,
    index: 1,
    columns: 3,
    rows: 2,
  },
};

for (const [suffix, index] of [
  [1001, 2],
  [1002, 5],
  [1058, 4],
  [1122, 3],
]) {
  portraits[`92000004-0000-4000-8000-${String(suffix).padStart(12, "0")}`] = {
    src: original,
    index,
    columns: 3,
    rows: 2,
  };
}

for (const [suffix, index] of [
  [1123, 1],
  [1167, 2],
  [1168, 0],
  [1198, 3],
  [1199, 5],
  [1264, 4],
  [1317, 7],
  [1318, 6],
  [1352, 8],
  [1401, 10],
  [1431, 11],
  [1475, 12],
  [1476, 13],
  [1514, 15],
]) {
  portraits[`92000004-0000-4000-8000-${String(suffix).padStart(12, "0")}`] = {
    src: showcase,
    index,
    columns: 4,
    rows: 4,
  };
}

export function getContactPortrait(personId: string) {
  return portraits[personId];
}

export function ContactPortrait({
  personId,
  size = 40,
}: {
  personId: string;
  size?: number;
}) {
  const picture = getContactPortrait(personId);
  if (!picture) return null;
  const { src, index, columns, rows } = picture;
  return (
    <span
      className="contact-portrait"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        backgroundImage: `url("${src}")`,
        backgroundSize: `${columns * 100}% ${rows * 100}%`,
        backgroundPosition: `${((index % columns) / (columns - 1)) * 100}% ${(Math.floor(index / columns) / (rows - 1)) * 100}%`,
      }}
    />
  );
}
