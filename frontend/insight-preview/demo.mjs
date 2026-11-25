import { matches } from './api.mjs';

const meridian = '10000000-0000-4000-8000-000000000002';
const platform = '20000000-0000-4000-8000-000000000004';
const procurement = '20000000-0000-4000-8000-000000000003';
const asOf = '2026-11-24T09:00:00Z';
const role = (code, label) => ({ code, label });
const lead = role('PROJECT_SPONSOR', 'Инициатор');
const finance = role('BUDGET_APPROVER', 'Утверждает бюджет');
const expert = role('TECHNICAL_EXPERT', 'Технический эксперт');
const buyer = role('PROCUREMENT_LEAD', 'Ведёт закупку');
const consult = role('CONSULTANT', 'Консультирует');

const groups = [
  ['Финансы', finance, [
    ['Александр Алексеев', 'Финансовый директор'], ['Анна Титова', 'Руководитель планирования'],
    ['Елена Шубина', 'Финансовый аналитик'], ['Артём Исаев', 'Бюджетный контролёр'], ['Павел Юдин', 'Менеджер по рискам'],
  ]],
  ['ИТ', lead, [
    ['Александр Александров', 'ИТ-директор'], ['Дарья Громова', 'Архитектор'], ['Максим Орлов', 'Руководитель эксплуатации'],
    ['Антон Климов', 'Ведущий инженер'], ['Ольга Савина', 'Менеджер проекта'], ['Вадим Романов', 'Инженер платформы'],
  ]],
  ['ИБ', expert, [
    ['Александр Беляев', 'Директор по ИБ'], ['Мария Цветкова', 'Аналитик ИБ'], ['Сергей Морозов', 'Архитектор ИБ'],
    ['Вера Родина', 'Менеджер по соответствию'], ['Никита Зуев', 'Инженер ИБ'],
  ]],
  ['Закупки', buyer, [
    ['Илья Нестеров', 'Руководитель закупок'], ['Полина Котова', 'Менеджер по закупкам'], ['Глеб Денисов', 'Юрисконсульт'],
    ['Алина Фролова', 'Специалист по тендерам'],
  ]],
  ['Бизнес', consult, [
    ['Софья Лебедева', 'Директор по развитию'], ['Иван Ковалёв', 'Владелец процесса'], ['Наталья Жукова', 'Бизнес-аналитик'],
    ['Кирилл Новиков', 'Руководитель операций'],
  ]],
];

const uuid = (prefix, index) => `${prefix}000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const procurementHead = '40000000-0000-4000-8000-000000000004';
const groupNodes = groups.map(([name, primaryRole, contacts], group) => contacts.map(([nameContact, jobTitle], index) => ({
  id: group === 3 && index === 0 ? procurementHead : uuid(4, 100 + group * 20 + index),
  name: nameContact,
  jobTitle,
  department: { id: uuid(3, 100 + group), name },
  role: index === 0 ? primaryRole : index % 3 === 0 ? expert : consult,
  decisionMaker: index === 0 && group < 3,
})));

const nodes = groupNodes.flat();
const edges = [];

function edge(source, target, type, label, confirmed = true) {
  edges.push({ id: uuid(5, 100 + edges.length), source: source.id, target: target.id, type, label, confirmed });
}

groupNodes.forEach(([head, ...team], group) => {
  team.forEach((person, index) => {
    edge(person, head, group === 2 ? 'EXPERTISE' : 'COORDINATION', 'Передаёт информацию руководителю', index !== 2);
    if (index > 0) edge(team[index - 1], person, 'COORDINATION', 'Координирует работу отдела');
  });
});
edge(groupNodes[1][0], groupNodes[0][0], 'APPROVAL', 'Согласует расчёт затрат и сроки закупки');
edge(groupNodes[2][0], groupNodes[1][0], 'EXPERTISE', 'Подтверждает требования безопасности');
edge(groupNodes[3][0], groupNodes[0][0], 'APPROVAL', 'Уточняет лимит закупки', false);
edge(groupNodes[4][0], groupNodes[1][0], 'COORDINATION', 'Собирает требования подразделений');
edge(groupNodes[2][1], groupNodes[3][1], 'EXPERTISE', 'Проверяет техническое задание');
edge(groupNodes[0][1], groupNodes[4][1], 'COORDINATION', 'Уточняет ожидаемый эффект проекта');
edge(groupNodes[1][1], groupNodes[2][2], 'EXPERTISE', 'Сверяет архитектурные ограничения');
edge(groupNodes[3][0], groupNodes[1][0], 'COORDINATION', 'Готовит закупочный план');

function graphFor(initiative, nodes, edges = []) {
  const unique = (items, key) => [...new Map(items.filter(Boolean).map((item) => [item[key], item])).values()];
  return {
    companyId: initiative.companyId, initiativeId: initiative.id, asOf: initiative.asOf, nodes, edges,
    matchingPeople: nodes.length,
    filters: { departments: unique(nodes.map((node) => node.department), 'id'), roles: unique(nodes.map((node) => node.role), 'code') },
  };
}

const platformInitiative = { id: platform, companyId: meridian, name: 'Единая ИТ-платформа', asOf };
const procurementInitiative = { id: procurement, companyId: meridian, name: 'Обновление закупочных процессов', asOf };

const interactions = [
  { id: 'demo-touch-1', personId: groupNodes[1][0].id, date: '2026-11-24', type: 'Встреча', text: 'Собрали требования ИТ к единой платформе. Следующий шаг — сверить их с ИБ.' },
  { id: 'demo-touch-2', personId: groupNodes[0][0].id, date: '2026-11-21', type: 'Звонок', text: 'Согласовали порядок оценки бюджета и перечень недостающих расчётов.' },
  { id: 'demo-touch-3', personId: groupNodes[2][0].id, date: '2026-11-19', type: 'Письмо', text: 'Получены требования к разграничению доступа для пилота.' },
];

export async function demoApi(signal) {
  const [companies, northInitiatives, infrastructure] = await Promise.all(['companies', 'initiatives', 'graph'].map(async (name) => {
    const response = await fetch(`/examples/${name}.json`, { signal });
    if (!response.ok) throw new Error('Не удалось загрузить примеры API');
    return response.json();
  }));
  const [pilotConsultant, , pilotLead] = infrastructure.nodes;
  const pilot = graphFor(northInitiatives[1], [
    { ...pilotConsultant, role: consult, decisionMaker: false },
    { ...pilotLead, role: lead, decisionMaker: true },
  ], [{ id: uuid(5, 3), source: pilotLead.id, target: pilotConsultant.id, type: 'COORDINATION', label: 'Уточняет финансовые ограничения пилота', confirmed: true }]);
  const fixtures = new Map([
    [platform, graphFor(platformInitiative, nodes, edges)],
    [procurement, graphFor(procurementInitiative, [{ ...groupNodes[3][0], decisionMaker: true }])],
    [infrastructure.initiativeId, infrastructure],
    [pilot.initiativeId, pilot],
  ]);
  return {
    live: false,
    companies: () => [companies.find((company) => company.id === meridian), ...companies.filter((company) => company.id !== meridian)],
    initiatives: (id) => id === meridian ? [platformInitiative, procurementInitiative] : northInitiatives.filter((item) => item.companyId === id),
    graph: (id, filters) => {
      const graph = fixtures.get(id);
      if (!graph) throw new Error('Инициатива не найдена');
      const nodes = graph.nodes.filter((node) => matches(node, filters));
      const visible = new Set(nodes.map((node) => node.id));
      return { ...graph, nodes, matchingPeople: nodes.length, edges: graph.edges.filter((item) => visible.has(item.source) && visible.has(item.target)) };
    },
    interactions: (id) => id === platform ? interactions : [],
  };
}
