import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from './vendor/d3-force-3d.mjs';

const ns = 'http://www.w3.org/2000/svg';
const width = 850;
const height = 540;
const scheme = ['forest', 'blue', 'purple', 'ochre', 'rose', 'slate'];
const relationClasses = { APPROVAL: 'approval', COORDINATION: 'coordination', EXPERTISE: 'expertise' };
const departmentClasses = new Map(['Финансы', 'ИТ', 'ИБ', 'Закупки', 'Бизнес', 'Отдел не указан'].map((name, index) => [name, scheme[index]]));
let lastLayout;

export const departmentName = (node) => node.department?.name ?? 'Отдел не указан';
export const departmentTone = (name) => departmentClasses.get(name) ?? 'slate';

function element(tag, attributes = {}, text) {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
}

function positions(nodes, edges) {
  if (!nodes.length) return new Map();
  const key = JSON.stringify([
    nodes.map((node) => [node.id, departmentName(node), node.decisionMaker]),
    edges.map((edge) => [edge.source, edge.target]),
  ]);
  if (lastLayout?.key === key) return lastLayout.points;

  // Give departments separate starting areas. The links and collision force place people within them.
  const groups = [...Map.groupBy(nodes, departmentName).values()];
  const layoutNodes = groups.flatMap((group, index) => {
    const angle = -Math.PI / 2 + index * 2 * Math.PI / groups.length;
    const anchorX = groups.length > 1 ? Math.cos(angle) * 170 : 0;
    const anchorY = groups.length > 1 ? Math.sin(angle) * 105 : 0;
    return group.map((node, position) => {
      const startAngle = position * 2.4 + angle;
      const radius = 28 * Math.sqrt(position);
      return { id: node.id, department: index, decisionMaker: node.decisionMaker, anchorX, anchorY,
        x: anchorX + Math.cos(startAngle) * radius, y: anchorY + Math.sin(startAngle) * radius };
    });
  });
  const ids = new Set(layoutNodes.map((node) => node.id));
  const links = edges.filter(({ source, target }) => ids.has(source) && ids.has(target) && source !== target)
    .map(({ source, target }) => ({ source, target }));
  const isWithinDepartment = (link) => link.source.department === link.target.department;
  forceSimulation(layoutNodes, 2).stop()
    .force('link', forceLink(links).id((node) => node.id)
      .distance((link) => isWithinDepartment(link) ? 88 : 185)
      .strength((link) => isWithinDepartment(link) ? .5 : .14))
    .force('charge', forceManyBody().strength((node) => node.decisionMaker ? -300 : -165))
    .force('collision', forceCollide((node) => node.decisionMaker ? 44 : 29).iterations(2))
    .force('x', forceX((node) => node.anchorX).strength(.17))
    .force('y', forceY((node) => node.anchorY).strength(.21))
    .tick(150);

  const xs = layoutNodes.map((node) => node.x);
  const ys = layoutNodes.map((node) => node.y);
  const left = Math.min(...xs), right = Math.max(...xs);
  const top = Math.min(...ys), bottom = Math.max(...ys);
  const centerX = (left + right) / 2, centerY = (top + bottom) / 2;
  const scale = Math.min(2, (width - 154) / Math.max(1, right - left), (height - 128) / Math.max(1, bottom - top));
  const points = new Map(layoutNodes.map(({ id, x, y }) => [id, [width / 2 + (x - centerX) * scale, height / 2 + (y - centerY) * scale]]));
  lastLayout = { key, points };
  return points;
}

function trimmedLine([x1, y1], [x2, y2], start, end) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length <= start + end) return { x1, y1, x2, y2 };
  const dx = (x2 - x1) / length;
  const dy = (y2 - y1) / length;
  return { x1: x1 + dx * start, y1: y1 + dy * start, x2: x2 - dx * end, y2: y2 - dy * end };
}

export function drawGraph(svg, { graphNodes, graphEdges, nodes, edges, selectedId, select, viewport }) {
  const coords = positions(graphNodes, graphEdges);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const defs = element('defs');
  for (const type of [...Object.values(relationClasses), 'other']) {
    const marker = element('marker', { id: `arrow-${type}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
    marker.append(element('path', { d: 'M 0 1 L 9 5 L 0 9 Z', class: `arrow ${type}` }));
    defs.append(marker);
  }
  const background = element('rect', { class: 'graph-background', x: -10000, y: -10000, width: 20000, height: 20000, fill: 'transparent' });
  const lines = element('g', { 'aria-hidden': 'true' });
  const people = element('g');
  const showFullLabels = nodes.length <= 8;
  const radius = (node) => node.decisionMaker ? 18 : showFullLabels || node.id === selectedId ? 13 : 9;

  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    const kind = relationClasses[edge.type] ?? 'other';
    const active = edge.source === selectedId || edge.target === selectedId;
    const line = element('line', {
      ...trimmedLine(coords.get(source.id), coords.get(target.id), radius(source) + 2, radius(target) + 3),
      class: `edge ${kind}${edge.confirmed ? '' : ' unconfirmed'}${active ? ' active' : ''}`,
      'marker-end': `url(#arrow-${kind})`,
    });
    line.append(element('title', {}, `${source.name} → ${target.name}. ${edge.label}`));
    lines.append(line);
  }

  const ordered = [...nodes].sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId));
  for (const node of ordered) {
    const [x, y] = coords.get(node.id);
    const size = radius(node);
    const active = node.id === selectedId;
    const group = element('g', {
      transform: `translate(${x},${y})`, class: `graph-node ${departmentTone(departmentName(node))}${node.decisionMaker ? ' lead-node' : ''}${active ? ' selected' : ''}`,
      role: 'button', tabindex: 0, 'aria-label': node.name, 'aria-pressed': active,
    });
    group.append(element('title', {}, [node.name, node.jobTitle, node.role?.label].filter(Boolean).join(' · ')));
    group.append(element('circle', { class: 'node-hit', r: Math.max(17, size + 6), fill: 'transparent' }));
    group.append(element('circle', { class: 'node-ring', r: size + 4 }));
    group.append(element('circle', { class: 'node-circle', r: size }));
    const labelled = showFullLabels || node.decisionMaker || active;
    const words = node.name.trim().split(/\s+/).filter(Boolean);
    const shortName = words.length > 1 ? `${words[0][0]}. ${words.at(-1)}` : node.name;
    const label = { y: size + 19, 'text-anchor': 'middle', 'aria-hidden': 'true' };
    const labelClass = labelled ? 'node-name' : 'node-name node-label-on-demand';
    if (labelled) {
      const initials = words.slice(0, 2).map((word) => word[0]).join('');
      group.append(element('text', { class: 'node-initials', y: '0.35em', 'text-anchor': 'middle', 'aria-hidden': 'true' }, initials));
    }
    group.append(element('text', { class: `${labelClass} node-name-full`, ...label }, node.name));
    group.append(element('text', { class: `${labelClass} node-name-short`, ...label }, shortName));
    group.addEventListener('click', () => select(node.id));
    group.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      select(node.id, true);
    });
    group.dataset.personId = node.id;
    people.append(group);
  }
  svg.replaceChildren(defs, background, lines, people);
  syncViewport(svg, viewport);
}

export function syncViewport(svg, viewport) {
  const w = width / viewport.scale;
  const h = height / viewport.scale;
  svg.setAttribute('viewBox', `${(width - w) / 2 + viewport.x} ${(height - h) / 2 + viewport.y} ${w} ${h}`);
}

export function attachPan(svg, viewport) {
  let start = null;
  svg.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('.graph-node')) return;
    start = { x: event.clientX, y: event.clientY, panX: viewport.x, panY: viewport.y };
    svg.setPointerCapture(event.pointerId);
    svg.classList.add('panning');
  });
  svg.addEventListener('pointermove', (event) => {
    if (!start) return;
    const zoomedWidth = svg.clientWidth / width;
    const zoomedHeight = svg.clientHeight / height;
    const ratio = Math.min(zoomedWidth, zoomedHeight) * viewport.scale;
    if (!ratio) return;
    viewport.x = start.panX - (event.clientX - start.x) / ratio;
    viewport.y = start.panY - (event.clientY - start.y) / ratio;
    syncViewport(svg, viewport);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    svg.addEventListener(name, () => { start = null; svg.classList.remove('panning'); });
  }
}
