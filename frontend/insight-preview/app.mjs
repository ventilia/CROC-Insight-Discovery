import { connect, matches } from './api.mjs';
import { drawGraph, attachPan, syncViewport, departmentName, departmentTone } from './graph.mjs';

const $ = (selector) => document.querySelector(selector);
const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });
const shortDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Moscow' });
const eventDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const plural = new Intl.PluralRules('ru');
const participantCount = (count) => `${count} ${{ one: 'участник', few: 'участника', many: 'участников' }[plural.select(count)] ?? 'участника'}`;
const dateText = (value, formatter = fmt) => value && Number.isFinite(Date.parse(value)) ? formatter.format(new Date(value)) : 'Дата не указана';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
const emptyFilters = () => ({ departmentId: '', roleCode: '', search: '', decisionOnly: false });
const blankRecords = () => ({ contacts: [], contactEdits: {}, edges: [], touches: [], requests: [], assessments: {} });
const tones = { positive: 'Положительные', neutral: 'Нейтральные', negative: 'Напряжённые', unknown: 'Не оценены' };
const relationLabels = { APPROVAL: 'Согласование', COORDINATION: 'Координация', EXPERTISE: 'Экспертиза' };
const eventTypes = { MEETING: 'Встреча', EMAIL: 'Письмо', CALL: 'Звонок' };
const nav = [
  ['graph', 'Карта связей'], ['people', 'Участники'], ['projects', 'Связи проектов'],
  ['timeline', 'Хронология'], ['requests', 'Запросы'], ['assistant', 'Ассистент'],
];
const icons = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  zoom: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
  refresh: '<path d="M20 4v5h-5M4 20v-5h5M4.8 9a8 8 0 0 1 12.5-3L20 9M4 15l2.7 3A8 8 0 0 0 19.2 15"/>',
};
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

const state = {
  api: null, companies: [], initiatives: [], companyId: '', initiativeId: '', base: null, graph: null,
  filters: emptyFilters(), selected: '', view: 'graph', dossier: 'overview', focus: 0,
  busy: false, error: '', filterError: '', toast: '', projectData: null, projectError: '', advice: [],
  viewport: { scale: 1, x: 0, y: 0 }, records: blankRecords(), modal: '',
};
let loadRequest;
let filterRequest;
let projectRequest;
const eventPages = new Map();

function readRecords() {
  if (!state.initiativeId) return blankRecords();
  const key = `croc-insight:v1:${state.api.live ? 'api' : 'demo'}:${state.initiativeId}`;
  try { return { ...blankRecords(), ...JSON.parse(localStorage.getItem(key)) }; }
  catch { return blankRecords(); }
}

function saveRecords(next) {
  const key = `croc-insight:v1:${state.api.live ? 'api' : 'demo'}:${state.initiativeId}`;
  localStorage.setItem(key, JSON.stringify(next));
  state.records = next;
}

const currentInitiative = () => state.initiatives.find((item) => item.id === state.initiativeId);
const currentCompany = () => state.companies.find((item) => item.id === state.companyId);
const withEdits = (node) => ({ ...node, ...state.records.contactEdits[node.id] });
const allNodes = () => [...(state.base?.nodes ?? []), ...state.records.contacts].map(withEdits);
const allEdges = () => [...(state.base?.edges ?? []), ...state.records.edges];
const personById = (id) => allNodes().find((node) => node.id === id);
const options = (items, selected, key = 'id', label = 'name') => items.map((item) =>
  `<option value="${esc(item[key])}"${item[key] === selected ? ' selected' : ''}>${esc(item[label])}</option>`).join('');

function touchList(personId = '') {
  const serverEvents = (eventPages.get(personId)?.items ?? []).map((event) => ({
    ...event, date: event.occurredAt, type: eventTypes[event.type] ?? event.type, text: event.subject,
  }));
  const exampleEvents = state.api?.interactions?.(state.initiativeId) ?? [];
  const localEvents = [...exampleEvents, ...state.records.touches]
    .filter((entry) => !personId || entry.personId === personId)
    .map((entry) => ({
      ...entry, participants: [{ id: entry.personId, name: personById(entry.personId)?.name ?? 'Участник' }],
      sourceLabel: state.api?.live ? 'Локальная запись' : null,
    }));
  return [...serverEvents, ...localEvents].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

function canLoadEvents(personId) {
  return state.api?.live && state.base && (!personId || state.base.nodes.some((person) => person.id === personId));
}

function latestTouchLabel() {
  const latest = touchList()[0];
  if (latest) return dateText(latest.date, shortDate);
  if (!state.api?.live) return 'Нет записей';
  const page = eventPages.get('');
  if (!page || page.loading) return 'Загружается…';
  return page.error ? 'Не удалось загрузить' : 'Нет записей';
}

function refreshEventPanel(personId) {
  const panel = $('[data-events-for]');
  if (panel?.dataset.eventsFor === personId) panel.innerHTML = eventPanelContent(personId);
  const latest = $('[data-latest-touch]');
  if (!personId && latest) latest.textContent = latestTouchLabel();
}

async function loadEvents(personId = '', cursor = null) {
  if (!canLoadEvents(personId) || eventPages.get(personId)?.loading) return;
  const page = eventPages.get(personId) ?? { items: [], nextCursor: null };
  const controller = new AbortController();
  const { signal } = controller;
  Object.assign(page, { controller, loading: true, error: '', requestedCursor: cursor });
  eventPages.set(personId, page);
  refreshEventPanel(personId);
  try {
    const result = await state.api.events(state.initiativeId, { personId, cursor }, signal);
    if (signal.aborted) return;
    const items = cursor ? [...page.items, ...result.items] : result.items;
    page.items = [...new Map(items.map((item) => [item.id, item])).values()];
    page.nextCursor = result.nextCursor;
  } catch (error) {
    if (!signal.aborted) page.error = error.message;
  } finally {
    if (!signal.aborted) {
      page.loading = false;
      refreshEventPanel(personId);
    }
  }
}

function visibleGraph() {
  const nodes = [...(state.graph?.nodes ?? []), ...state.records.contacts].map(withEdits).filter((node) => matches(node, state.filters));
  const edges = [...(state.graph?.edges ?? []), ...state.records.edges];
  let visible = new Set(nodes.map((node) => node.id));
  if (state.focus && visible.has(state.selected)) {
    const neighbors = new Set([state.selected]);
    for (let step = 0; step < state.focus; step += 1) {
      const current = new Set(neighbors);
      for (const edge of edges) {
        if (!visible.has(edge.source) || !visible.has(edge.target)) continue;
        if (current.has(edge.source)) neighbors.add(edge.target);
        if (current.has(edge.target)) neighbors.add(edge.source);
      }
    }
    visible = neighbors;
  }
  return { nodes: nodes.filter((node) => visible.has(node.id)), edges: edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target)) };
}

function updatePickers() {
  $('#company').innerHTML = options(state.companies, state.companyId) || '<option>Нет компаний</option>';
  $('#initiative').innerHTML = options(state.initiatives, state.initiativeId) || '<option>Нет инициатив</option>';
  $('#company').disabled = state.busy || !state.companies.length;
  $('#initiative').disabled = state.busy || !state.initiatives.length;
  $('#refresh').disabled = state.busy;
  $('#add').disabled = state.busy || !state.base;
  $('#source-badge').textContent = state.api ? (state.api.live ? 'Локальный API' : 'Демоданные') : 'Источники данных';
  $('#breadcrumb').textContent = currentCompany()?.name ?? 'Рабочее пространство';
  $('#initiative-title').textContent = currentInitiative()?.name ?? 'Карта связей';
  $('#workspace').setAttribute('aria-busy', String(state.busy));
}

async function load(companyId = state.companyId, initiativeId = state.initiativeId) {
  loadRequest?.abort();
  filterRequest?.abort();
  projectRequest?.abort();
  for (const page of eventPages.values()) page.controller.abort();
  eventPages.clear();
  const controller = new AbortController();
  loadRequest = controller;
  const { signal } = controller;
  Object.assign(state, { busy: true, error: '', filterError: '', toast: '', graph: null, base: null, selected: '',
    dossier: 'overview', filters: emptyFilters(), focus: 0, projectData: null, projectError: '', advice: [] });
  Object.assign(state.viewport, { scale: 1, x: 0, y: 0 });
  render();
  try {
    const api = state.api ?? await connect(signal);
    const companies = await api.companies(signal);
    const company = companies.find((item) => item.id === companyId) ?? companies[0];
    const initiatives = company ? await api.initiatives(company.id, signal) : [];
    const initiative = initiatives.find((item) => item.id === initiativeId) ?? initiatives[0];
    const base = initiative ? await api.graph(initiative.id, emptyFilters(), signal) : null;
    if (signal.aborted) return;
    Object.assign(state, { api, companies, companyId: company?.id ?? '', initiatives, initiativeId: initiative?.id ?? '', base, graph: base });
    state.records = readRecords();
  } catch (error) {
    if (signal.aborted) return;
    state.error = error.message;
  } finally {
    if (!signal.aborted) {
      state.busy = false;
      render();
      if (state.base && state.api.live) void loadEvents();
      if (state.view === 'projects' && state.base) void loadProjects();
    }
  }
}

async function applyServerFilters() {
  filterRequest?.abort();
  const controller = new AbortController();
  filterRequest = controller;
  state.filterError = '';
  const { departmentId, roleCode } = state.filters;
  if (!departmentId && !roleCode) {
    state.graph = state.base;
    updateContent();
    return;
  }
  try {
    const graph = await state.api.graph(state.initiativeId, { departmentId, roleCode }, controller.signal);
    if (controller.signal.aborted) return;
    state.graph = graph;
    updateContent();
  } catch (error) {
    if (controller.signal.aborted) return;
    state.filterError = error.message;
    state.graph = state.base;
    updateContent();
  }
}

const renderNav = () => {
  $('#navigation').innerHTML = nav.map(([key, title]) =>
    `<button type="button" class="nav-button${state.view === key ? ' active' : ''}" data-view="${key}"${state.view === key ? ' aria-current="page"' : ''}>${title}</button>`).join('');
};

function toolbar(extra = '') {
  const { departments, roles } = state.base.filters;
  return `<div class="toolbar" role="group" aria-label="Поиск и фильтры участников">
    <label class="search">${icon('search')}<input id="search" type="search" aria-label="Найти участника" placeholder="Поиск людей" value="${esc(state.filters.search)}"><kbd>/</kbd></label>
    <details class="filter"><summary>Фильтры<span id="filter-indicator" class="filter-indicator" hidden></span></summary>
      <div class="filter-popup">
        <label for="department">Отдел</label><select id="department"><option value="">Все отделы</option>${options(departments, state.filters.departmentId)}</select>
        <label for="role">Роль</label><select id="role"><option value="">Все роли</option>${options(roles, state.filters.roleCode, 'code', 'label')}</select>
        <button class="button text-button" type="button" data-action="clear-filters">Сбросить фильтры</button>
      </div>
    </details>
    <label class="decision-filter"><input type="checkbox" id="decision-only" ${state.filters.decisionOnly ? 'checked' : ''}> Только ЛПР</label>
    ${extra || '<span id="result-count" class="result-count" role="status"></span>'}
  </div>`;
}

function render() {
  updatePickers();
  renderNav();
  const content = $('#workspace-content');
  $('#notice').hidden = true;
  if (state.busy) { content.innerHTML = '<div class="empty" role="status">Загружаем инициативу…</div>'; return; }
  if (state.error) { content.innerHTML = `<div class="empty" role="alert"><strong>Не удалось загрузить данные</strong><p>${esc(state.error)}</p><button type="button" class="button" data-action="retry">Повторить</button></div>`; return; }
  if (!state.base) { content.innerHTML = '<div class="empty">Для этой компании нет доступных инициатив.</div>'; return; }
  content.innerHTML = `${state.view === 'people' ? toolbar() : ''}<div id="view"></div>`;
  if (state.view === 'graph') {
    $('#view').innerHTML = `<div class="graph-layout">
      <section class="graph-board" aria-label="Карта связей">
        ${toolbar('<button type="button" class="button graph-add" data-action="link" aria-label="Добавить связь">＋ Связь</button>')}
        <div class="graph-stage"><svg id="network" role="group" aria-label="Интерактивный граф участников" preserveAspectRatio="xMidYMid meet"></svg><div id="graph-empty" class="graph-empty" role="status" hidden></div></div>
        <div class="board-footer"><div class="graph-key"><span id="result-count" class="result-count" role="status"></span><div id="legend" class="legend"></div></div><div class="graph-navigation"><button type="button" class="button" data-action="focus" hidden></button><div class="zoom-controls" aria-label="Масштаб графа"><button type="button" data-action="zoom-out" aria-label="Уменьшить">−</button><button type="button" data-action="zoom-in" aria-label="Увеличить">+</button><button type="button" data-action="zoom-reset" aria-label="Показать весь граф">${icon('zoom')}</button></div></div></div>
      </section><aside id="rail" class="rail" aria-label="Сводка проекта"></aside>
    </div>`;
    attachPan($('#network'), state.viewport);
  }
  updateContent();
}

function contactButton(person) {
  return `<button class="contact-link" type="button" data-person="${esc(person.id)}"><strong>${esc(person.name)}</strong>${person.decisionMaker ? '<span class="tag">ЛПР</span>' : ''}</button>`;
}

function summary() {
  const nodes = allNodes();
  const leaders = nodes.filter((person) => person.decisionMaker);
  const edges = allEdges();
  const departments = new Set(nodes.map((person) => person.department?.id).filter(Boolean));
  const unconfirmed = edges.filter((edge) => !edge.confirmed).length;
  return `<h2>Сводка проекта</h2>
    <dl class="definition">
      <div><dt>Участники</dt><dd>${nodes.length}</dd></div>
      <div><dt>Отделы</dt><dd>${departments.size}</dd></div>
      <div><dt>Связи</dt><dd>${edges.length}</dd></div>
      <div><dt>Связи на проверке</dt><dd${unconfirmed ? ' class="attention"' : ''}>${unconfirmed}</dd></div>
      <div><dt>Последнее касание</dt><dd data-latest-touch>${esc(latestTouchLabel())}</dd></div>
      <div><dt>Дата среза</dt><dd>${esc(dateText(state.base.asOf, shortDate))}</dd></div>
    </dl>
    <section class="rail-section"><h3>Принимают решения <span class="subtle-count">${leaders.length}</span></h3>
      ${leaders.length ? `<ul class="contact-list">${leaders.map((person) => `<li><button class="contact-link" type="button" data-person="${esc(person.id)}"><strong>${esc(person.name)}</strong></button><span class="muted">${esc(person.role?.label ?? person.jobTitle ?? 'Роль не указана')}</span></li>`).join('')}</ul>` : '<p class="muted">ЛПР пока не отмечены.</p>'}
    </section><button type="button" class="button text-button assistant-link" data-view="assistant">Стратегия общения</button>`;
}

function dossier(person) {
  const avatar = esc(person.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join(''));
  const links = allEdges().filter((edge) => edge.source === person.id || edge.target === person.id);
  const tabs = [['overview', 'Обзор'], ['links', 'Связи'], ['touches', 'Касания']];
  let content = `<dl class="definition"><div><dt>Отдел</dt><dd>${esc(person.department?.name ?? 'Не указан')}</dd></div><div><dt>Роль</dt><dd>${esc(person.role?.label ?? 'Не указана')}</dd></div><div><dt>Отношения</dt><dd>${esc(tones[state.records.assessments[person.id] ?? 'unknown'])}</dd></div></dl><div class="dossier-actions"><button type="button" class="button" data-action="assessment">Изменить оценку</button><button type="button" class="button" data-action="edit-contact">Править карточку</button></div>`;
  if (state.dossier === 'links') content = links.length ? `<ul class="detail-list">${links.map((edge) => {
    const other = personById(edge.source === person.id ? edge.target : edge.source);
    return `<li><span class="muted">${edge.source === person.id ? 'Исходящая связь' : 'Входящая связь'} · ${edge.confirmed ? 'Подтверждена' : 'Требует проверки'}</span>${other ? contactButton(other) : ''}<p>${esc(edge.label)}</p></li>`;
  }).join('')}</ul>` : '<p class="muted">У участника нет связей.</p>';
  if (state.dossier === 'touches') content = `${eventPanel(person.id)}<button type="button" class="button" data-action="touch">Добавить касание</button>`;
  return `<div class="dossier-heading"><span class="avatar ${departmentTone(departmentName(person))}">${avatar}</span><div><h2>${esc(person.name)}</h2><p>${esc(person.jobTitle ?? 'Должность не указана')}</p></div><button type="button" class="icon-button" data-action="close-dossier" aria-label="Закрыть досье">×</button></div>
    <div class="tabs" aria-label="Разделы досье">${tabs.map(([id, title]) => `<button type="button" data-dossier="${id}" aria-pressed="${state.dossier === id}">${title}</button>`).join('')}</div><div class="dossier-body">${content}</div>`;
}

function graphContent(graph) {
  const svg = $('#network');
  const selected = personById(state.selected);
  const preserveKeyboard = svg.contains(document.activeElement) ? document.activeElement.dataset.personId : '';
  drawGraph(svg, allNodes(), graph.nodes, graph.edges, state.selected, selectPerson, state.viewport);
  if (preserveKeyboard) svg.querySelector(`[data-person-id="${CSS.escape(preserveKeyboard)}"]`)?.focus({ preventScroll: true });
  const empty = $('#graph-empty');
  empty.hidden = Boolean(graph.nodes.length);
  empty.textContent = 'По выбранным фильтрам никого не найдено';
  const focus = $('[data-action="focus"]');
  focus.hidden = !selected;
  focus.textContent = ['Окружение', 'Один шаг', 'Два шага'][state.focus];
  focus.title = 'Переключить окружение выбранного участника';
  focus.setAttribute('aria-pressed', String(Boolean(state.focus)));
  const names = [...new Set(graph.nodes.map(departmentName))];
  $('#legend').innerHTML = `${names.map((name) => `<span><i class="legend-dot ${departmentTone(name)}"></i>${esc(name)}</span>`).join('')}<span><i class="legend-ring"></i>ЛПР</span><span><i class="legend-dash"></i>Связь на проверке</span>`;
  $('#rail').innerHTML = selected ? dossier(selected) : summary();
}

function peopleContent(graph) {
  const selected = personById(state.selected);
  const rows = graph.nodes.map((person) => `<tr>
    <td>${contactButton(person)}<div class="muted">${esc(person.jobTitle ?? 'Должность не указана')}</div></td>
    <td>${esc(person.department?.name ?? '—')}</td><td>${esc(person.role?.label ?? '—')}</td></tr>`).join('');
  const table = rows ? `<div class="table-wrap"><table><thead><tr><th scope="col">Имя и должность</th><th scope="col">Отдел</th><th scope="col">Роль в инициативе</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">По выбранным фильтрам никого не найдено.</div>';
  return `<div class="graph-layout"><section class="surface"><div class="section-heading"><h2>Участники проекта</h2></div>${table}</section><aside class="rail" aria-label="Досье контакта">${selected ? dossier(selected) : summary()}</aside></div>`;
}

async function loadProjects() {
  projectRequest?.abort();
  const controller = new AbortController();
  projectRequest = controller;
  state.projectError = '';
  const others = state.initiatives.filter((item) => item.id !== state.initiativeId);
  try {
    const results = await Promise.all(others.map(async (initiative) => ({ initiative, graph: await state.api.graph(initiative.id, emptyFilters(), controller.signal) })));
    if (!controller.signal.aborted) state.projectData = results;
  } catch (error) {
    if (!controller.signal.aborted) state.projectError = error.message;
  }
  if (!controller.signal.aborted && state.view === 'projects') updateContent();
}

function projectsContent() {
  const current = new Set(allNodes().map((person) => person.id));
  if (state.projectError) return pageSection('Связи между проектами', `<div class="empty" role="alert">${esc(state.projectError)} <button type="button" class="button" data-action="retry-projects">Повторить</button></div>`);
  if (!state.projectData) return pageSection('Связи между проектами', '<div class="empty" role="status">Загружаем другие инициативы…</div>');
  return pageSection('Связи между проектами', state.projectData.length ? `<ul class="records">${state.projectData.map(({ initiative, graph }) => {
    const shared = graph.nodes.filter((node) => current.has(node.id));
    return `<li><div><strong>${esc(initiative.name)}</strong><p>${shared.length ? shared.map((node) => esc(node.name)).join(', ') : 'Общих участников нет'}</p></div><button type="button" class="button" data-initiative="${esc(initiative.id)}">Открыть инициативу</button></li>`;
  }).join('')}</ul>` : '<div class="empty">У компании нет других инициатив.</div>');
}

const pageSection = (title, content, action = '') => `<section class="surface page-section"><div class="section-heading"><h2>${title}</h2>${action}</div>${content}</section>`;

function eventPanelContent(personId) {
  const touches = touchList(personId);
  const page = eventPages.get(personId);
  const loading = canLoadEvents(personId) && (!page || page.loading);
  const emptyClass = personId ? 'muted event-status' : 'empty';
  const records = touches.map((entry) => {
    const names = entry.participants.map((participant) => participant.name).join(', ');
    const datetime = `<time datetime="${esc(entry.date)}">${esc(dateText(entry.date, entry.occurredAt ? eventDate : fmt))}</time>`;
    const context = [entry.type, entry.team, personId && entry.participants.length === 1 ? null : names].filter(Boolean).join(' · ');
    return `<li>${datetime}<div class="event-text"><strong>${esc(entry.text)}</strong><p class="event-context">${esc(context)}</p>
      ${entry.outcome ? `<p><b>Итог:</b> ${esc(entry.outcome)}</p>` : ''}${entry.nextStep ? `<p><b>Следующий шаг:</b> ${esc(entry.nextStep)}</p>` : ''}
      ${entry.sourceLabel ? `<p class="event-context">${esc(entry.sourceLabel)}</p>` : ''}</div></li>`;
  }).join('');
  const status = loading ? '<p class="event-status muted" role="status">Загружаем касания…</p>'
    : page?.error ? `<div class="event-status" role="alert"><p>Не удалось загрузить касания. ${esc(page.error)}</p><button type="button" class="button" data-action="events-retry">Повторить</button></div>`
    : page?.nextCursor ? '<div class="event-status"><button type="button" class="button" data-action="events-more">Показать ещё</button></div>'
    : touches.length ? '' : `<p class="${emptyClass}">${personId ? 'У участника пока нет касаний.' : 'Касаний пока нет.'}</p>`;
  return `${records ? `<ol class="${personId ? 'detail-list' : 'records timeline'}">${records}</ol>` : ''}${status}`;
}

function eventPanel(personId = '') {
  return `<div data-events-for="${esc(personId)}">${eventPanelContent(personId)}</div>`;
}

function timelineContent() {
  return pageSection('Хронология касаний', eventPanel(), '<button class="button" type="button" data-action="touch">＋ Касание</button>');
}

function requestsContent() {
  return pageSection('Запросы информации', state.records.requests.length ? `<ul class="records">${state.records.requests.map((item) => `<li><div><strong>${esc(item.type)}</strong><p>${esc(item.text)}</p></div>${item.reviewed ? '<span class="tag">Просмотрен</span>' : `<button class="button" type="button" data-reviewed="${esc(item.id)}">Отметить просмотренным</button>`}</li>`).join('')}</ul>` : '<div class="empty">Пока нет запросов. Здесь команда может оставлять сведения о контактах и вопросы для менеджера.</div>', '<button class="button" type="button" data-action="request">＋ Запрос</button>');
}

function assistantContent() {
  return pageSection('Стратегия общения', `<div class="assistant-body"><p class="muted">Рекомендации по ролям, связям и истории общения в этой инициативе.</p>${state.advice.length ? `<ol class="advice">${state.advice.map((item) => `<li>${esc(item)}</li>`).join('')}</ol>` : ''}<button class="button primary" type="button" data-action="recommend">Сформировать рекомендации</button></div>`);
}

function updateContent() {
  let graph = visibleGraph();
  if (['graph', 'people'].includes(state.view) && state.selected && !graph.nodes.some((person) => person.id === state.selected)) {
    state.selected = '';
    state.focus = 0;
    graph = visibleGraph();
  }
  const notice = $('#notice');
  notice.hidden = !(state.filterError || state.toast);
  notice.textContent = state.filterError ? `Серверный фильтр недоступен. Применён фильтр к загруженным данным. ${state.filterError}` : state.toast;
  const count = $('#result-count');
  if (count) {
    const total = allNodes().length;
    count.textContent = graph.nodes.length === total ? participantCount(total) : `${graph.nodes.length} из ${total} участников`;
  }
  const indicator = $('#filter-indicator');
  if (indicator) indicator.hidden = !(state.filters.departmentId || state.filters.roleCode);
  if (state.view === 'graph') graphContent(graph);
  else $('#view').innerHTML = { people: peopleContent, projects: projectsContent, timeline: timelineContent, requests: requestsContent, assistant: assistantContent }[state.view](graph);
}

function selectPerson(id, keyboard = false) {
  state.selected = id;
  state.dossier = 'overview';
  updateContent();
  if (keyboard) $('#network')?.querySelector(`[data-person-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
}

const field = (label, name, type = 'text', value = '') => `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" required ${type === 'text' ? 'maxlength="100"' : ''}></label>`;
const area = (label) => `<label>${label}<textarea name="text" rows="4" maxlength="600" required></textarea></label>`;
const select = (label, name, choices) => `<label>${label}<select name="${name}" required>${choices}</select></label>`;
const choices = (values, current) => Object.entries(values).map(([key, label]) => `<option value="${esc(key)}"${key === current ? ' selected' : ''}>${esc(label)}</option>`).join('');

function openModal(kind) {
  if (!state.base) return;
  const contactOptions = options(allNodes(), state.selected);
  const selected = personById(state.selected);
  const { departments, roles } = state.base.filters;
  const forms = {
    choose: ['Добавить в инициативу', [['contact', 'Участника'], ['link', 'Связь'], ['touch', 'Касание'], ['request', 'Запрос']].map(([type, label]) => `<button class="button" type="button" data-action="${type}">${label}</button>`).join('')],
    contact: ['Новый участник', `${field('Имя и фамилия', 'name')}${field('Должность', 'jobTitle')}${select('Отдел', 'departmentId', `<option value="none">Не указан</option>${options(departments)}`)}${select('Роль', 'roleCode', `<option value="none">Не указана</option>${options(roles, '', 'code', 'label')}`)}<label class="check-field"><input type="checkbox" name="decisionMaker"> Лицо, принимающее решение</label>`],
    link: ['Новая связь', `${select('От кого', 'source', contactOptions)}${select('К кому', 'target', `<option value="">Выберите участника</option>${options(allNodes())}`)}${select('Тип', 'relationType', choices(relationLabels))}${field('Описание', 'label')}<label class="check-field"><input type="checkbox" name="confirmed"> Подтверждена</label>`],
    touch: ['Новое касание', `${select('Участник', 'personId', contactOptions)}${select('Тип', 'type', choices({ 'Встреча': 'Встреча', 'Звонок': 'Звонок', 'Письмо': 'Письмо', 'Заметка': 'Заметка' }))}${field('Дата', 'date', 'date', today())}${area('Что обсуждали')}`],
    request: ['Запрос информации', `${select('Тип', 'type', choices({ 'Уточнение': 'Уточнение', 'Новый контакт': 'Новый контакт', 'Впечатление после общения': 'Впечатление после общения' }))}${area('Сообщение для команды')}`],
    assessment: ['Оценка отношений', selected ? select(esc(selected.name), 'assessment', choices(tones, state.records.assessments[selected.id] ?? 'unknown')) : ''],
    'edit-contact': ['Правка карточки', selected ? `${field('Имя и фамилия', 'name', 'text', selected.name)}${field('Должность', 'jobTitle', 'text', selected.jobTitle ?? '')}` : ''],
  };
  if ((kind === 'touch' || kind === 'link') && !contactOptions) {
    state.toast = 'Сначала добавьте участника.';
    updateContent();
    return;
  }
  state.modal = kind;
  $('#modal-title').textContent = forms[kind][0];
  $('#modal-fields').innerHTML = forms[kind][1];
  $('.modal-actions').hidden = kind === 'choose';
  $('#modal-error').hidden = true;
  if (!$('#modal').open) $('#modal').showModal();
  $('#modal-fields').querySelector('input, select, textarea, button')?.focus();
}

function saveModal(event) {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  const get = (name) => String(fields.get(name) ?? '').trim();
  const next = structuredClone(state.records);
  const id = crypto.randomUUID();
  const { departments, roles } = state.base.filters;
  let addedContact = false;
  try {
    if (state.modal === 'contact') {
      if (!get('name') || !get('jobTitle')) throw new Error('Заполните имя и должность.');
      next.contacts.push({ id, name: get('name'), jobTitle: get('jobTitle'), department: departments.find((item) => item.id === get('departmentId')) ?? null, role: roles.find((item) => item.code === get('roleCode')) ?? null, decisionMaker: fields.has('decisionMaker') });
      addedContact = true;
    } else if (state.modal === 'link') {
      if (get('source') === get('target')) throw new Error('Выберите двух разных участников.');
      if (!get('label')) throw new Error('Укажите, что означает связь.');
      if (allEdges().some((edge) => edge.source === get('source') && edge.target === get('target') && edge.type === get('relationType'))) throw new Error('Между этими участниками уже есть связь такого типа.');
      next.edges.push({ id, source: get('source'), target: get('target'), type: get('relationType'), label: get('label'), confirmed: fields.has('confirmed') });
    } else if (state.modal === 'touch' || state.modal === 'request') {
      if (!get('text')) throw new Error('Добавьте текст записи.');
      if (state.modal === 'touch') next.touches.push({ id, personId: get('personId'), date: get('date'), type: get('type'), text: get('text') });
      else next.requests.unshift({ id, type: get('type'), text: get('text'), reviewed: false });
    } else if (state.modal === 'assessment' && personById(state.selected)) {
      next.assessments[state.selected] = get('assessment');
    } else if (state.modal === 'edit-contact' && personById(state.selected)) {
      if (!get('name') || !get('jobTitle')) throw new Error('Заполните имя и должность.');
      next.contactEdits[state.selected] = { name: get('name'), jobTitle: get('jobTitle') };
    } else return;
    saveRecords(next);
    $('#modal').close();
    state.toast = 'Сохранено в этом браузере.';
    state.advice = [];
    if (addedContact) {
      state.filters = emptyFilters(); state.graph = state.base; state.focus = 0; state.selected = id; state.dossier = 'overview';
      state.view = 'graph';
      filterRequest?.abort();
      render();
    } else updateContent();
  } catch (error) {
    $('#modal-error').textContent = error.name === 'QuotaExceededError' ? 'В браузере закончилось место для записей.' : error.message;
    $('#modal-error').hidden = false;
  }
}

function recommendations() {
  const nodes = allNodes();
  const leads = nodes.filter((node) => node.decisionMaker);
  const unconfirmed = allEdges().filter((edge) => !edge.confirmed);
  const previous = new Set(touchList().flatMap((item) => item.participants.map((participant) => participant.id)));
  const target = leads.find((node) => !previous.has(node.id)) ?? leads[0];
  const actions = [];
  if (target) actions.push(`Запланируйте разговор с участником «${target.name}». Роль в инициативе — ${target.role?.label ?? 'ЛПР'}. Уточните критерии решения и ближайший срок.`);
  else actions.push('Уточните, кто принимает решение по инициативе, и внесите его в карту.');
  if (unconfirmed.length) {
    const link = unconfirmed[0];
    actions.push(`Проверьте связь «${personById(link.source)?.name ?? 'участник'} → ${personById(link.target)?.name ?? 'участник'}» перед тем, как опираться на неё.`);
  }
  const last = touchList()[0];
  if (last) actions.push(`Перед разговором проверьте последнее касание от ${dateText(last.date)}. ${last.text}`);
  else if (state.api.live && !eventPages.get('')?.loading && eventPages.get('')?.error) actions.push('Проверьте хронологию после восстановления связи с API.');
  else actions.push('После контакта запишите договорённость и следующий шаг в хронологии.');
  state.advice = actions;
  updateContent();
  $('[data-action="recommend"]')?.focus({ preventScroll: true });
}

$('#company').addEventListener('change', (event) => void load(event.target.value, ''));
$('#initiative').addEventListener('change', (event) => void load(state.companyId, event.target.value));
$('#refresh').addEventListener('click', () => void load());
$('#add').addEventListener('click', () => openModal('choose'));
$('#modal-form').addEventListener('submit', saveModal);
$('#workspace-content').addEventListener('input', (event) => {
  if (event.target.id !== 'search') return;
  state.filters.search = event.target.value;
  updateContent();
});
$('#workspace-content').addEventListener('change', (event) => {
  const { id, value, checked } = event.target;
  if (id === 'decision-only') { state.filters.decisionOnly = checked; updateContent(); }
  if (id === 'department' || id === 'role') {
    state.filters[id === 'department' ? 'departmentId' : 'roleCode'] = value;
    state.graph = state.base;
    updateContent();
    void applyServerFilters();
  }
});
document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  const popup = $('.filter[open]');
  if (popup && !popup.contains(event.target)) popup.open = false;
  if (!button) return;
  const { action, view, person, dossier: tab, initiative, reviewed } = button.dataset;
  if (view) {
    state.view = view;
    render();
    $(`#navigation [data-view="${view}"]`)?.focus({ preventScroll: true });
    if (view === 'projects' && state.base && !state.projectData) void loadProjects();
  }
  if (person) {
    if (state.view === 'graph' && !visibleGraph().nodes.some((node) => node.id === person)) {
      Object.assign(state, { filters: emptyFilters(), graph: state.base, focus: 0 });
      filterRequest?.abort();
      render();
    }
    selectPerson(person);
  }
  if (tab) {
    state.dossier = tab;
    updateContent();
    $(`[data-dossier="${tab}"]`)?.focus({ preventScroll: true });
    if (tab === 'touches' && state.selected && !eventPages.has(state.selected)) void loadEvents(state.selected);
  }
  if (initiative) void load(state.companyId, initiative);
  if (reviewed) {
    const next = { ...state.records, requests: state.records.requests.map((item) => item.id === reviewed ? { ...item, reviewed: true } : item) };
    try { saveRecords(next); state.toast = 'Запрос отмечен просмотренным.'; }
    catch { state.toast = 'Не удалось сохранить изменение в браузере.'; }
    updateContent();
  }
  if (!action) return;
  if (action === 'close-modal') $('#modal').close();
  if (action === 'retry') void load();
  if (action === 'retry-projects') void loadProjects();
  if (action === 'events-more' || action === 'events-retry') {
    const personId = button.closest('[data-events-for]').dataset.eventsFor;
    const page = eventPages.get(personId);
    void loadEvents(personId, action === 'events-more' ? page.nextCursor : page.requestedCursor);
  }
  if (['contact', 'edit-contact', 'link', 'touch', 'request', 'assessment'].includes(action)) openModal(action);
  if (action === 'close-dossier') { state.selected = ''; state.focus = 0; updateContent(); }
  if (action === 'clear-filters') {
    state.filters = emptyFilters(); state.graph = state.base; state.filterError = ''; state.focus = 0;
    filterRequest?.abort();
    render();
    $('.filter summary')?.focus();
  }
  if (action === 'focus') { state.focus = (state.focus + 1) % 3; updateContent(); }
  if (action === 'recommend') recommendations();
  if (action.startsWith('zoom-')) {
    if (action === 'zoom-reset') Object.assign(state.viewport, { scale: 1, x: 0, y: 0 });
    else state.viewport.scale = Math.max(.6, Math.min(3, state.viewport.scale * (action === 'zoom-in' ? 1.2 : 1 / 1.2)));
    syncViewport($('#network'), state.viewport);
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !$('#modal').open && !event.target.matches('input, textarea, select')) {
    const search = $('#search');
    if (search) { event.preventDefault(); search.focus(); }
  }
});

$('#refresh').innerHTML = `${icon('refresh')} Обновить данные`;
$('#add').textContent = '＋ Добавить';
void load();
