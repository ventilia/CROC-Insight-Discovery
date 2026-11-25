import { useEffect, useState } from "react";
import {
  Building2,
  CalendarDays,
  ChevronRight,
  LayoutDashboard,
  Menu,
  Network,
  Plus,
  RefreshCw,
  Search,
  ChartColumn,
  Users,
  X,
  Copy,
  Sun,
  Moon,
} from "lucide-react";
import type { Company } from "./api";
import { ContactPage } from "./ContactPage";
import { WorkspaceEdit, type WorkspaceAction } from "./WorkspaceEdit";
import { ProjectIndex, ProjectLinks, Requests } from "./ProjectWorkspace";
import { CrmImport } from "./CrmImport";
import { InfluenceMap } from "./InfluenceMap";
import { RelationshipHealth } from "./RelationshipHealth";
import { Navigator } from "./Navigator";
import { ContactDrawer } from "./ContactDrawer";
import { ContactFilters, emptyContactFilters } from "./ContactFilters";
import { EventForm } from "./EventForm";
import { HistoryList, HistoryPanel } from "./History";
import { formatDate, meetingBrief } from "./coverage";
import { relationshipHealth } from "./health";
import {
  companyData,
  contactMatches,
  history,
  influenceLabels,
  portfolioStats,
  roleTone,
  snapshot,
  uniquePeople,
  useWorkspace,
  type InitiativeData,
  type WorkspaceData,
} from "./workspace";

const tabs = [
  { key: "overview", label: "О компании" },
  { key: "map", label: "Карта связей" },
  { key: "contacts", label: "Контакты" },
  { key: "history", label: "История" },
  { key: "insights", label: "Аналитика" },
  { key: "projects", label: "Связи проектов" },
  { key: "requests", label: "Запросы" },
];
function useRoute() {
  const [route, setRoute] = useState(() => location.hash.slice(1) || "/");
  useEffect(() => {
    const update = () => setRoute(location.hash.slice(1) || "/");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}
export function App() {
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#101512" : "#f2f5f2");
    try {
      localStorage.setItem("kit.theme", theme);
    } catch {
      /* Storage may be unavailable. */
    }
  }, [theme]);
  const route = useRoute(),
    [path, query = ""] = route.split("?"),
    parts = path.split("/").filter(Boolean);
  const [days, setDays] = useState(30),
    workspace = useWorkspace(days);
  const [search, setSearch] = useState(""),
    [mobileNav, setMobileNav] = useState(false),
    [toast, setToast] = useState("");
  const [contentVersion, setContentVersion] = useState(0);
  const [editor, setEditor] = useState<WorkspaceAction | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [person, setPerson] = useState<{ iid: string; pid: string } | null>(
      null,
    ),
    [form, setForm] = useState<{ iid: string; pid?: string } | null>(null);
  const data = workspace.data,
    companies = data?.companies ?? [];
  const company = companies.find((company) => company.id === parts[1]);
  const items = data && company ? companyData(data, company.id) : [];
  const active =
    items.find(
      (item) =>
        item.initiative.id === new URLSearchParams(query).get("initiative"),
    ) ?? (new URLSearchParams(query).has("initiative") ? undefined : items[0]);
  const tab =
    parts[2] === "person"
      ? "contacts"
      : tabs.some((tab) => tab.key === parts[2])
        ? parts[2]
        : "overview";
  const isClient = parts[0] === "client",
    isCompanies = parts[0] === "companies";
  const selected = data?.initiatives.find(
    (item) => item.initiative.id === person?.iid,
  );
  const go = (path: string) => {
    location.hash = path;
    setPerson(null);
    setProfileOpen(false);
    setSearch("");
    setMobileNav(false);
  };
  const openPerson = (iid: string, pid: string) => {
    setPerson({ iid, pid });
    setProfileOpen(true);
  };
  const canEdit = data?.capabilities.canCreateEvents ?? false;
  const canManage = data?.capabilities.canManageWorkspace === true;
  const fullPerson = (iid: string, pid: string) => {
    const item = data?.initiatives.find((item) => item.initiative.id === iid);
    if (item)
      go(
        `/client/${item.initiative.companyId}/person/${pid}?initiative=${iid}`,
      );
  };

  const quickRoute = (view: string) => {
    const id = company?.id ?? companies[0]?.id;
    if (id)
      go(
        `/client/${id}/${view}${active ? "?initiative=" + active.initiative.id : ""}`,
      );
  };
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  const searchPeople =
    data && search.trim()
      ? uniquePeople(data.initiatives)
          .filter((person) =>
            [person.name, person.jobTitle, person.email].some((value) =>
              value
                ?.toLocaleLowerCase("ru")
                .includes(search.trim().toLocaleLowerCase("ru")),
            ),
          )
          .slice(0, 5)
      : [];
  const searchCompanies = search.trim()
    ? companies.filter((company) =>
        company.name
          .toLocaleLowerCase("ru")
          .includes(search.trim().toLocaleLowerCase("ru")),
      )
    : [];
  return (
    <div className="kit-app">
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Закрыть навигацию"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={"sidebar" + (mobileNav ? " expanded" : "")}>
        <a
          className="kit-brand"
          href="#/"
          onClick={() => {
            setPerson(null);
            setProfileOpen(false);
            setMobileNav(false);
          }}
        >
          <span>
            KIT<small>KROK insight tool</small>
          </span>
        </a>
        <div className="sidebar-context">
          <label>
            Компания
            <select
              aria-label="Компания в рабочем пространстве"
              value={company?.id ?? ""}
              onChange={(event) =>
                go(
                  `/client/${event.target.value}/${isClient ? tab : "overview"}`,
                )
              }
            >
              <option value="" disabled>
                Выберите компанию
              </option>
              {companies.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          {active && (
            <label>
              Проект
              <select
                aria-label="Проект в рабочем пространстве"
                value={active.initiative.id}
                onChange={(event) =>
                  go(
                    `/client/${company!.id}/${tab}?initiative=${event.target.value}`,
                  )
                }
              >
                {items.map((entry) => (
                  <option key={entry.initiative.id} value={entry.initiative.id}>
                    {entry.initiative.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <span className="nav-caption">Разделы</span>
        <nav aria-label="Основная навигация">
          <button
            className={!isClient && !isCompanies ? "active" : ""}
            onClick={() => go("/")}
          >
            <LayoutDashboard size={19} />
            Обзор
          </button>
          <button
            className={
              isCompanies || (isClient && tab === "overview") ? "active" : ""
            }
            onClick={() => go("/companies")}
          >
            <Building2 size={19} />
            Клиенты<span>{companies.length}</span>
          </button>
          <button
            className={isClient && tab === "map" ? "active" : ""}
            onClick={() => quickRoute("map")}
            disabled={!companies.length}
          >
            <Network size={19} />
            Карта связей
          </button>
          <button
            className={isClient && tab === "contacts" ? "active" : ""}
            onClick={() => quickRoute("contacts")}
            disabled={!companies.length}
          >
            <Users size={19} />
            Контакты
          </button>
          <button
            className={isClient && tab === "history" ? "active" : ""}
            onClick={() => quickRoute("history")}
            disabled={!companies.length}
          >
            <CalendarDays size={19} />
            История
          </button>
          <button
            className={isClient && tab === "insights" ? "active" : ""}
            onClick={() => quickRoute("insights")}
            disabled={!companies.length}
          >
            <ChartColumn size={19} />
            Аналитика
          </button>
          <button
            className={isClient && tab === "projects" ? "active" : ""}
            disabled={!companies.length}
            onClick={() => quickRoute("projects")}
          >
            Связи проектов
          </button>
          <button
            className={isClient && tab === "requests" ? "active" : ""}
            disabled={!companies.length}
            onClick={() => quickRoute("requests")}
          >
            Запросы
          </button>
        </nav>
        <button
          type="button"
          className="sidebar-theme-toggle"
          aria-label={
            theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"
          }
          title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
        </button>
        <div className="sidebar-footer">
          <div>
            <strong>Команда КРОК</strong>
            <small>Рабочая группа</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              type="button"
              className="icon-button mobile-menu"
              aria-label="Открыть навигацию"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={22} />
            </button>
            <span>Рабочее пространство</span>
            <ChevronRight size={14} />
            <strong>
              {isClient
                ? (company?.name ?? "Клиент")
                : isCompanies
                  ? "Клиенты"
                  : "Обзор"}
            </strong>
          </div>
          <div className="global-search">
            <Search size={18} />
            <input
              aria-label="Поиск по платформе"
              type="search"
              placeholder="Компания или контакт"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search.trim() && (
              <div className="search-results">
                {searchCompanies.map((company) => (
                  <button
                    key={company.id}
                    onClick={() => go(`/client/${company.id}/overview`)}
                  >
                    <Building2 size={17} />
                    <span>
                      {company.name}
                      <small>Компания</small>
                    </span>
                  </button>
                ))}
                {searchPeople.map((person) => (
                  <button
                    key={person.id}
                    onClick={() => {
                      const item = data!.initiatives.find((item) =>
                        item.graph.nodes.some((p) => p.id === person.id),
                      )!;
                      go(
                        `/client/${item.initiative.companyId}/contacts?initiative=${item.initiative.id}`,
                      );
                      openPerson(item.initiative.id, person.id);
                    }}
                  >
                    <Users size={17} />
                    <span>
                      {person.name}
                      <small>{person.jobTitle ?? "Контакт"}</small>
                    </span>
                  </button>
                ))}
                {!searchCompanies.length && !searchPeople.length && (
                  <p>Ничего не найдено</p>
                )}
              </div>
            )}
          </div>

          <button
            className="secondary crm-import-trigger"
            disabled={!data || !canEdit}
            onClick={() => setImportOpen(true)}
          >
            Импорт из CRM
          </button>
        </header>
        <main className="main-content" aria-busy={workspace.loading}>
          {workspace.error && (
            <div className="error-banner" role="alert">
              <span>{workspace.error}</span>
              <button className="secondary" onClick={workspace.refresh}>
                Повторить загрузку
              </button>
            </div>
          )}
          {!data ? (
            <div className="empty-state">
              <RefreshCw size={28} />
              <h2>
                {workspace.loading
                  ? "Загружаем данные…"
                  : "Данные пока недоступны"}
              </h2>
              <p>Компании, контакты и история взаимодействий</p>
            </div>
          ) : (
            <>
              {workspace.loading && (
                <div className="updating" role="status">
                  Обновляем данные…
                </div>
              )}
              {isClient && !company ? (
                <div className="empty-state">
                  <Building2 size={32} />
                  <h2>Компания недоступна</h2>
                  <button className="primary" onClick={() => go("/companies")}>
                    К списку клиентов
                  </button>
                </div>
              ) : isClient && company && parts[2] === "person" && parts[3] ? (
                <ContactPage
                  onRefresh={workspace.refresh}
                  item={active}
                  personId={parts[3]}
                  items={items}
                  dark={theme === "dark"}
                  canEdit={canEdit}
                  go={go}
                  onEvent={() =>
                    active &&
                    setForm({ iid: active.initiative.id, pid: parts[3] })
                  }
                  onManage={canManage ? setEditor : undefined}
                />
              ) : isClient && company ? (
                <>
                  <div className="page-title">
                    <div>
                      <span className="eyebrow">Корпоративный клиент</span>
                      <h1>{company.name}</h1>
                      <p>
                        {company.industry ?? "Отрасль пока не указана"} ·
                        проектов: {items.length} · данные на{" "}
                        {formatDate(snapshot(items))}
                      </p>
                    </div>
                    <div className="page-actions">
                      <button
                        className="secondary"
                        disabled={!canManage}
                        onClick={() =>
                          setEditor({ kind: "project", cid: company.id })
                        }
                      >
                        Новый проект
                      </button>
                      <button
                        className="primary"
                        disabled={!canEdit || !active}
                        onClick={() =>
                          active && setForm({ iid: active.initiative.id })
                        }
                      >
                        <Plus size={18} />
                        Взаимодействие
                      </button>
                    </div>
                  </div>
                  {!canEdit && (
                    <p className="read-only-note">
                      Доступен просмотр. Для добавления взаимодействий нужен
                      доступ редактора.
                    </p>
                  )}
                  <nav className="client-tabs" aria-label="Разделы клиента">
                    {tabs.map((item) => (
                      <button
                        key={item.key}
                        aria-current={tab === item.key ? "page" : undefined}
                        onClick={() =>
                          go(
                            `/client/${company.id}/${item.key}${query ? "?" + query : ""}`,
                          )
                        }
                      >
                        {item.label}
                      </button>
                    ))}
                  </nav>
                  {tab === "overview" ? (
                    <>
                      <CompanyOverview
                        company={company}
                        items={items}
                        onPerson={openPerson}
                        onMap={() => go(`/client/${company.id}/map`)}
                      />
                      <ProjectIndex items={items} go={go} />
                    </>
                  ) : tab === "projects" ? (
                    <ProjectLinks
                      key={company.id + items.length}
                      items={items}
                      go={go}
                      onPerson={fullPerson}
                      canManage={canManage}
                      onCreate={() =>
                        setEditor({ kind: "project", cid: company.id })
                      }
                    />
                  ) : tab === "history" ? (
                    <HistoryPanel
                      key={company.id}
                      entries={history(items)}
                      onPerson={openPerson}
                    />
                  ) : !active ? (
                    <div className="empty-state">
                      <h2>Проекты пока не указаны</h2>
                      <p>Карта появится после добавления проектов.</p>
                    </div>
                  ) : (
                    <>
                      <div className="scope-bar">
                        <label>
                          Проект
                          <select
                            value={active.initiative.id}
                            onChange={(event) =>
                              go(
                                `/client/${company.id}/${tab}?initiative=${event.target.value}`,
                              )
                            }
                          >
                            {items.map((item) => (
                              <option
                                key={item.initiative.id}
                                value={item.initiative.id}
                              >
                                {item.initiative.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Период общения
                          <select
                            value={days}
                            onChange={(event) =>
                              setDays(Number(event.target.value))
                            }
                          >
                            {[7, 14, 30, 60, 90].map((days) => (
                              <option key={days} value={days}>
                                {days} дней
                              </option>
                            ))}
                          </select>
                        </label>
                        <span>
                          Данные на {formatDate(active.coverage.asOf)}
                        </span>
                      </div>
                      <div className="workspace-actions">
                        <button
                          className="secondary"
                          disabled={!canManage}
                          onClick={() =>
                            setEditor({
                              kind: "person",
                              iid: active.initiative.id,
                            })
                          }
                        >
                          Новый участник
                        </button>
                        <button
                          className="secondary"
                          disabled={!canManage}
                          onClick={() =>
                            setEditor({
                              kind: "request",
                              iid: active.initiative.id,
                            })
                          }
                        >
                          Запросить информацию
                        </button>
                      </div>
                      {tab === "requests" ? (
                        <Requests
                          key={active.initiative.id + contentVersion}
                          item={active}
                          canManage={canManage}
                          onPerson={fullPerson}
                          onCreate={() =>
                            setEditor({
                              kind: "request",
                              iid: active.initiative.id,
                            })
                          }
                        />
                      ) : tab === "map" ? (
                        <InfluenceMap
                          key={active.initiative.id + query}
                          item={active}
                          initialFocus={new URLSearchParams(query).get("focus")}
                          onlyIds={new URLSearchParams(query)
                            .get("shared")
                            ?.split(",")}
                          onAddRelationship={
                            canManage
                              ? () =>
                                  setEditor({
                                    kind: "relationship",
                                    iid: active.initiative.id,
                                  })
                              : undefined
                          }
                          darkTheme={theme === "dark"}
                          selectedId={
                            person?.iid === active.initiative.id
                              ? person.pid
                              : null
                          }
                          onSelect={(id) =>
                            openPerson(active.initiative.id, id)
                          }
                        />
                      ) : tab === "contacts" ? (
                        <ContactTable
                          key={active.initiative.id}
                          item={active}
                          onPerson={openPerson}
                          toast={setToast}
                        />
                      ) : (
                        <Insights
                          key={active.initiative.id}
                          item={active}
                          onContacts={() =>
                            go(
                              `/client/${company.id}/contacts?initiative=${active.initiative.id}`,
                            )
                          }
                        />
                      )}
                    </>
                  )}
                </>
              ) : isCompanies ? (
                <>
                  <div className="page-title">
                    <div>
                      <span className="eyebrow">Компании</span>
                      <h1>Клиенты</h1>
                      <p>
                        Структура, контакты и состояние отношений с каждой
                        компанией
                      </p>
                    </div>
                    <span className="total-label">
                      Всего: {companies.length}
                    </span>
                  </div>
                  <CompanyGrid
                    data={data}
                    onOpen={(id) => go(`/client/${id}/overview`)}
                  />
                </>
              ) : (
                <Dashboard data={data} go={go} onPerson={openPerson} />
              )}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>KIT · KROK insight tool</span>
        </footer>
      </div>
      {profileOpen &&
        person &&
        selected?.graph.nodes.some((p) => p.id === person.pid) && (
          <ContactDrawer
            key={person.iid + person.pid}
            item={selected}
            onRefresh={workspace.refresh}
            workspaceItems={data?.initiatives ?? []}
            onFull={() => fullPerson(person.iid, person.pid)}
            onMap={() =>
              go(
                `/client/${selected.initiative.companyId}/map?initiative=${person.iid}&focus=${person.pid}`,
              )
            }
            onManage={canManage ? setEditor : undefined}
            personId={person.pid}
            close={() => setProfileOpen(false)}
            onPerson={openPerson}
            canEdit={canEdit}
            onEvent={() => setForm({ iid: person.iid, pid: person.pid })}
          />
        )}
      {editor && canManage && (
        <WorkspaceEdit
          key={JSON.stringify(editor)}
          action={editor}
          item={data?.initiatives.find((i) => i.initiative.id === editor.iid)}
          close={() => setEditor(null)}
          saved={(id) => {
            const action = editor;
            setEditor(null);
            setContentVersion((v) => v + 1);
            setToast("Изменения сохранены");
            workspace.refresh();
            const item = data?.initiatives.find(
              (i) => i.initiative.id === action.iid,
            );
            if (action.kind === "project")
              go(`/client/${action.cid}/map?initiative=${id}`);
            else if (action.kind === "person" && item)
              go(
                `/client/${item.initiative.companyId}/person/${id}?initiative=${item.initiative.id}`,
              );
            else if (action.kind === "request" && item)
              go(
                `/client/${item.initiative.companyId}/requests?initiative=${item.initiative.id}`,
              );
          }}
        />
      )}
      {importOpen && data && (
        <CrmImport
          data={data}
          initialId={active?.initiative.id}
          close={() => setImportOpen(false)}
          saved={(message) => {
            setImportOpen(false);
            setToast(message);
            workspace.refresh();
          }}
        />
      )}
      {form && data && (
        <EventForm
          items={data.initiatives.filter(
            (item) =>
              item.initiative.companyId ===
              data.initiatives.find((x) => x.initiative.id === form.iid)
                ?.initiative.companyId,
          )}
          initialInitiative={form.iid}
          initialPerson={form.pid}
          close={() => setForm(null)}
          saved={() => {
            setForm(null);
            setToast(
              "Взаимодействие сохранено. История и аналитика обновляются.",
            );
            workspace.refresh();
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button
            className="icon-button"
            aria-label="Скрыть уведомление"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function Dashboard({
  data,
  go,
  onPerson,
}: {
  data: WorkspaceData;
  go: (path: string) => void;
  onPerson: (iid: string, pid: string) => void;
}) {
  const stats = portfolioStats(data),
    riskItems = data.initiatives.flatMap((item) =>
      relationshipHealth(item.coverage).risks.map((text) => ({ item, text })),
    );
  const metrics = [
    {
      label: "Компании",
      value: stats.companies,

      note: "Доступны вашей команде",
    },
    {
      label: "Контакты в базе",
      value: stats.contacts,

      note: "Сотрудники компаний",
    },
    {
      label: "Взаимодействия",
      value: stats.events,

      note: "За 30 дней до указанной даты",
    },
    {
      label: "Замечания",
      value: stats.risks,

      note: "По данным проектов",
    },
  ];
  return (
    <div className="dashboard">
      <div className="page-title">
        <div>
          <h1>Работа с клиентами</h1>
          <p>Компании, контакты и последние записи.</p>
        </div>
        <span className="snapshot-label">
          <CalendarDays size={16} />
          {formatDate(snapshot(data.initiatives))}
        </span>
      </div>
      <section className="metric-grid" aria-label="Основные показатели">
        {metrics.map((metric) => (
          <div className="metric-card" key={metric.label}>
            <div>
              <span>{metric.label}</span>
            </div>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </div>
        ))}
      </section>
      <div className="section-heading outside">
        <div>
          <h2>Клиенты</h2>
          <p>Контакты и история работы с каждой компанией.</p>
        </div>
        <button className="text-button" onClick={() => go("/companies")}>
          Все клиенты
          <ChevronRight size={17} />
        </button>
      </div>
      <CompanyGrid data={data} onOpen={(id) => go(`/client/${id}/overview`)} />
      <div className="dashboard-bottom">
        <section className="surface">
          <div className="section-heading">
            <div>
              <h2>Что нужно проверить</h2>
              <p>По истории общения и данным сотрудников.</p>
            </div>
          </div>
          <div className="risk-list">
            {riskItems.slice(0, 4).map(({ item, text }, index) => (
              <button
                key={item.initiative.id + index}
                onClick={() =>
                  go(
                    `/client/${item.initiative.companyId}/insights?initiative=${item.initiative.id}`,
                  )
                }
              >
                <span className="risk-dot" />
                <div>
                  <strong>{text}</strong>
                  <small>
                    {
                      data.companies.find(
                        (company) => company.id === item.initiative.companyId,
                      )?.name
                    }{" "}
                    · {item.initiative.name}
                  </small>
                </div>
                <ChevronRight size={17} />
              </button>
            ))}
            {!riskItems.length && (
              <p className="empty-inline">Замечаний по текущим данным нет.</p>
            )}
          </div>
        </section>
        <section className="surface">
          <div className="section-heading">
            <div>
              <h2>Последние взаимодействия</h2>
              <p>Встречи, звонки и переписка.</p>
            </div>
            <CalendarDays size={19} />
          </div>
          <HistoryList
            entries={history(data.initiatives)}
            onPerson={onPerson}
            compact
          />
        </section>
      </div>
    </div>
  );
}
function CompanyGrid({
  data,
  onOpen,
}: {
  data: WorkspaceData;
  onOpen: (id: string) => void;
}) {
  return data.companies.length ? (
    <div className="company-grid">
      {data.companies.map((company) => {
        const items = companyData(data, company.id),
          people = uniquePeople(items),
          departments = new Set(
            people.map((person) => person.department?.id).filter(Boolean),
          );
        const risks = items.reduce(
          (total, item) =>
            total + relationshipHealth(item.coverage).risks.length,
          0,
        );
        return (
          <button
            className="company-card surface"
            key={company.id}
            onClick={() => onOpen(company.id)}
          >
            <div className="company-card-top">
              <span className="pill">Проектов: {items.length}</span>
              <ChevronRight size={20} />
            </div>
            <h3>{company.name}</h3>
            <p>{company.industry ?? "Отрасль не указана"}</p>
            <div className="company-card-stats">
              <span>
                <Users size={16} />
                Контактов: {people.length}
              </span>
              <span>
                <Building2 size={16} />
                Подразделений: {departments.size}
              </span>
            </div>
            <div className="company-card-footer">
              <span className={risks ? "attention-text" : ""}>
                {risks ? `Замечаний: ${risks}` : "Нет замечаний"}
              </span>
              <small>Обновлено {formatDate(snapshot(items))}</small>
            </div>
          </button>
        );
      })}
    </div>
  ) : (
    <div className="empty-state">
      <Building2 size={32} />
      <h2>Клиентов пока нет</h2>
      <p>Компании появятся после загрузки данных из источника.</p>
    </div>
  );
}
function CompanyOverview({
  company,
  items,
  onPerson,
  onMap,
}: {
  company: Company;
  items: InitiativeData[];
  onPerson: (iid: string, pid: string) => void;
  onMap: () => void;
}) {
  const people = uniquePeople(items),
    departments = [
      ...new Map(
        people
          .filter((person) => person.department)
          .map((person) => [person.department!.id, person.department!]),
      ).values(),
    ];
  const keyPeople = people.filter((person) =>
    items.some((item) =>
      item.graph.nodes.some((p) => p.id === person.id && p.decisionMaker),
    ),
  );
  return (
    <>
      <section className="company-summary surface">
        <div>
          <span className="eyebrow">О клиенте</span>
          <h2>{company.name}</h2>
          <p>{company.description ?? "Описание компании не заполнено."}</p>
          <button className="primary" disabled={!items.length} onClick={onMap}>
            <Network size={17} />
            Открыть карту связей
          </button>
        </div>
        <div className="company-facts">
          <div>
            <strong>{people.length}</strong>
            <span>сотрудников</span>
          </div>
          <div>
            <strong>{departments.length}</strong>
            <span>подразделений</span>
          </div>
          <div>
            <strong>{keyPeople.length}</strong>
            <span>ключевых ЛПР</span>
          </div>
          <div>
            <strong>{history(items).length}</strong>
            <span>взаимодействий</span>
          </div>
        </div>
      </section>
      <div className="overview-columns">
        <section className="surface">
          <div className="section-heading">
            <div>
              <h2>Подразделения</h2>
              <p>Отделы, указанные в проектах компании.</p>
            </div>
            <Building2 size={19} />
          </div>
          <div className="department-cards">
            {departments.map((department) => {
              const members = people.filter(
                  (person) => person.department?.id === department.id,
                ),
                recent = members.filter((person) =>
                  items.some((item) =>
                    item.coverage.contacts.some(
                      (p) => p.id === person.id && p.touchStatus === "RECENT",
                    ),
                  ),
                );
              return (
                <div key={department.id}>
                  <div>
                    <strong>{department.name}</strong>
                    <small>
                      Контактов: {members.length} · с недавним контактом:{" "}
                      {recent.length}
                    </small>
                  </div>
                  <span
                    className={
                      "status-tag " + (recent.length ? "RECENT" : "STALE")
                    }
                  >
                    {recent.length ? "Есть контакт" : "Нет недавних контактов"}
                  </span>
                </div>
              );
            })}
            {!departments.length && (
              <p className="empty-inline">Подразделения пока не указаны.</p>
            )}
          </div>
        </section>
        <section className="surface">
          <div className="section-heading">
            <div>
              <h2>Ключевые участники</h2>
              <p>Лица, принимающие решения</p>
            </div>
            <Users size={19} />
          </div>
          <div className="key-people">
            {keyPeople.map((person) => {
              const item = items.find((item) =>
                item.graph.nodes.some(
                  (p) => p.id === person.id && p.decisionMaker,
                ),
              )!;
              return (
                <button
                  key={person.id}
                  onClick={() => onPerson(item.initiative.id, person.id)}
                >
                  <div>
                    <strong>{person.name}</strong>
                    <small>{person.jobTitle ?? "Должность не указана"}</small>
                  </div>
                  <ChevronRight size={17} />
                </button>
              );
            })}
            {!keyPeople.length && (
              <p className="empty-inline">ЛПР пока не определены.</p>
            )}
          </div>
        </section>
      </div>
      <section className="surface">
        <div className="section-heading">
          <div>
            <h2>Последние взаимодействия</h2>
            <p>Записи по всем проектам компании.</p>
          </div>
        </div>
        <HistoryList entries={history(items)} onPerson={onPerson} compact />
      </section>
    </>
  );
}
function ContactTable({
  item,
  onPerson,
  toast,
}: {
  item: InitiativeData;
  onPerson: (iid: string, pid: string) => void;
  toast: (text: string) => void;
}) {
  const [filters, setFilters] = useState(emptyContactFilters),
    visible = item.graph.nodes.filter((person) =>
      contactMatches(person, item, filters),
    );
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [filters]);
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(visible.length / 12) - 1),
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        meetingBrief(
          item.initiative.name,
          item.coverage.asOf,
          item.coverage.days,
          item.coverage.contacts.filter((person) =>
            visible.some((p) => p.id === person.id),
          ),
        ),
      );
      toast("Список к встрече скопирован");
    } catch {
      toast("Не удалось скопировать список");
    }
  }
  return (
    <section className="surface">
      <div className="section-heading">
        <div>
          <h2>
            Контакты <span className="count-badge">{visible.length}</span>
          </h2>
          <p>Роли, влияние и история общения</p>
        </div>
        <button className="secondary" disabled={!visible.length} onClick={copy}>
          <Copy size={16} />
          Список к встрече
        </button>
      </div>
      <ContactFilters item={item} value={filters} change={setFilters} />
      {visible.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th>Роль в решении</th>
                <th>Влияние</th>
                <th>Взаимодействия</th>
                <th>Данные</th>
              </tr>
            </thead>
            <tbody>
              {visible
                .slice(currentPage * 12, currentPage * 12 + 12)
                .map((person) => {
                  const coverage = item.coverage.contacts.find(
                    (p) => p.id === person.id,
                  );
                  return (
                    <tr key={person.id}>
                      <td>
                        <button
                          className="person-button"
                          onClick={() =>
                            onPerson(item.initiative.id, person.id)
                          }
                        >
                          <span>
                            <strong>{person.name}</strong>
                            <small>
                              {person.jobTitle ?? "Должность не указана"}
                            </small>
                            <small>
                              {person.department?.name ?? "Отдел не указан"}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>
                        <span
                          className={
                            "role-badge tone-" + roleTone(person.role?.code)
                          }
                        >
                          {person.role?.label ?? "Не указана"}
                        </span>
                      </td>
                      <td>{influenceLabels[person.influence ?? "UNKNOWN"]}</td>
                      <td>
                        <span
                          className={
                            "status-tag " + (coverage?.touchStatus ?? "UNKNOWN")
                          }
                        >
                          {
                            {
                              RECENT: "Недавний контакт",
                              STALE: "Давно не общались",
                              UNKNOWN: "Нет записей",
                            }[coverage?.touchStatus ?? "UNKNOWN"]
                          }
                        </span>
                        <small className="cell-date">
                          {formatDate(coverage?.lastTouchAt ?? null)}
                        </small>
                      </td>
                      <td>
                        <span
                          className={
                            "status-tag " +
                            (coverage?.verificationStatus ?? "UNKNOWN")
                          }
                        >
                          {coverage?.verificationStatus === "RECENT"
                            ? "Проверены"
                            : coverage?.verificationStatus === "STALE"
                              ? "Давняя проверка"
                              : "Нет проверки"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <Search size={28} />
          <h3>Контакты не найдены</h3>
          <p>Попробуйте изменить условия поиска.</p>
        </div>
      )}
      {visible.length > 12 && (
        <div className="table-pagination">
          <button
            className="secondary"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Назад
          </button>
          <span>
            Страница {currentPage + 1} из {Math.ceil(visible.length / 12)} ·
            всего {visible.length}
          </span>
          <button
            className="secondary"
            disabled={(currentPage + 1) * 12 >= visible.length}
            onClick={() => setPage(currentPage + 1)}
          >
            Далее
          </button>
        </div>
      )}
    </section>
  );
}
function Insights({
  item,
  onContacts,
}: {
  item: InitiativeData;
  onContacts: () => void;
}) {
  const health = relationshipHealth(item.coverage);
  return (
    <>
      <RelationshipHealth data={item.coverage} />
      <section className="surface insights-panel">
        <div className="section-heading">
          <div>
            <h2>Рекомендации</h2>
            <p>Что можно сделать по выбранному проекту.</p>
          </div>
        </div>
        <div className="insight-grid">
          {health.risks.map((risk, index) => (
            <article key={risk}>
              <span className="insight-label">Требует проверки</span>
              <h3>{risk}</h3>
              <p>
                {index === 0 && health.active <= 1
                  ? "Уточните, кто ещё принимает решения, и запланируйте знакомство."
                  : risk.includes("непроверенными данными")
                    ? "Попросите ответственного менеджера проверить должность и контакты сотрудника."
                    : risk.includes("Отделы")
                      ? "Попросите знакомых сотрудников представить вас коллегам из этих отделов."
                      : "Уточните информацию у коллег и добавьте недостающие записи."}
              </p>
              <button className="text-button" onClick={onContacts}>
                Посмотреть контакты
                <ChevronRight size={16} />
              </button>
            </article>
          ))}
          {!health.risks.length && (
            <p className="empty-inline">
              Замечаний по текущим данным нет. Добавляйте результаты встреч и
              звонков.
            </p>
          )}
        </div>
      </section>
      <Navigator
        initiativeId={item.initiative.id}
        days={item.coverage.days}
        asOf={item.coverage.asOf}
      />
    </>
  );
}
