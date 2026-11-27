import { useEffect, useState } from "react";
import {
  Building2,
  CalendarDays,
  ChevronDown,
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
  GitMerge,
  MessageSquareText,
  Settings2,
} from "lucide-react";
import { useDebounced, useRemote, type Company, type Initiative } from "./api";
import { CompanyDirectory, DirectoryContact } from "./CompanyDirectory";
import { internalRoute, publicRoute, resolveCompany } from "./routes";
import { PersistedPanel } from "./PersistedPanel";
import LostConnections from "./LostConnections";
import {
  riskLabel,
  type CompanyInsights,
  type CompanyProfile,
} from "./companyApi";
import { ContactPage } from "./ContactPage";
import { WorkspaceEdit, type WorkspaceAction } from "./WorkspaceEdit";
import { ProjectIndex, ProjectLinks, Requests } from "./ProjectWorkspace";
import { CrmImport } from "./CrmImport";
import { InfluenceMap, type MapNavigationContext } from "./InfluenceMap";
import { RelationshipHealth } from "./RelationshipHealth";
import { LocalModelDialog, Navigator } from "./Navigator";
import { ContactDrawer } from "./ContactDrawer";
import { ContactFilters, emptyContactFilters } from "./ContactFilters";
import { ContactPortrait } from "./ContactPortrait";
import { EventForm } from "./EventForm";
import {
  CompanyTimeline,
  HistoryList,
  HistoryPanel,
  historyEntries,
} from "./History";
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
  emptyProject,
  type InitiativeData,
  type WorkspaceData,
} from "./workspace";

const tabs = [
  { key: "overview", label: "О компании" },
  { key: "map", label: "Карта связей" },
  { key: "contacts", label: "Контакты" },
  { key: "history", label: "История" },
  { key: "insights", label: "Аналитика" },
  { key: "projects", label: "Связи проектов", icon: GitMerge },
  { key: "requests", label: "Запросы", icon: MessageSquareText },
];
const INTERACTION_DAYS = 30;

function useRoute() {
  const read = () => internalRoute(location.hash.startsWith("#/") ? location.hash.slice(1) : location.pathname + location.search);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const update = () => setRoute(read());
    window.addEventListener("hashchange", update);
    window.addEventListener("popstate", update);
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  return { route, setRoute };
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
  const { route, setRoute } = useRoute();
  const [path, query = ""] = route.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(query);
  const isClient = parts[0] === "client";
  const isCompanies = parts[0] === "companies";
  const contactDetail = ["person", "directory"].includes(parts[2]);
  const tab = contactDetail
    ? "contacts"
    : tabs.some((entry) => entry.key === parts[2])
      ? parts[2]
      : "overview";
  const days = INTERACTION_DAYS;
  const [search, setSearch] = useState(""),
    [mobileNav, setMobileNav] = useState(false),
    [toast, setToast] = useState("");
  const [contentVersion, setContentVersion] = useState(0);
  const [editor, setEditor] = useState<WorkspaceAction | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelRevision, setModelRevision] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [person, setPerson] = useState<{ iid: string; pid: string } | null>(
      null,
    ),
    [form, setForm] = useState<{ iid: string; pid?: string } | null>(null);
  const projectId = params.get("initiative") ?? undefined;
  const workspace = useWorkspace(days, {
    companyId: isClient ? parts[1] : undefined,
    projectId,
    view: isClient
      ? contactDetail
        ? parts[2]
        : tab
      : undefined,
    personId: parts[3],
  });
  const data = workspace.data,
    companies = data?.companies ?? [];
  const company = resolveCompany(companies, parts[1]);
  useEffect(() => {
    if (!data || (isClient && !company)) return;
    const address = publicRoute(route, companies);
    if (address !== location.pathname + location.search || location.hash.startsWith("#/"))
      window.history.replaceState(null, "", address);
  }, [route, data, companies, company, isClient]);
  const server = data?.capabilities.mode === "api";
  const profile = data?.profile?.id === company?.id ? data?.profile : undefined;
  const companyInsights =
    data?.insights?.companyId === company?.id ? data?.insights : undefined;
  const items = data && company ? companyData(data, company.id) : [];
  const active =
    items.find((item) => item.initiative.id === projectId) ??
    (!projectId ? items[0] : undefined);
  const selected = data?.initiatives.find(
    (item) => item.initiative.id === person?.iid,
  );
  const go = (path: string) => {
    const address = publicRoute(path, companies);
    if (address !== location.pathname + location.search)
      window.history.pushState(null, "", address);
    setRoute(internalRoute(address));
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
  const directoryPerson = (id: string, pid: string) =>
    go(`/client/${id}/directory/${pid}`);
  const mapPerson = (
    iid: string,
    pid: string,
    context?: MapNavigationContext,
  ) => {
    if (!company) return;
    const target = new URLSearchParams({ initiative: iid, from: "map" });
    const shared = params.get("shared");
    const focus = context ? context.focus : params.get("focus");
    if (focus) target.set("focus", focus);
    if (shared) {
      target.set("shared", shared);
      if (!(context?.sharedOnly ?? params.get("sharedOnly") !== "0"))
        target.set("sharedOnly", "0");
    }
    if (context ? context.depth === 2 : params.get("depth") === "2")
      target.set("depth", "2");
    go(`/client/${company.id}/person/${pid}?${target}`);
  };
  const mapReturn =
    params.get("from") === "map" && company && active && parts[3]
      ? `/client/${company.id}/map?${new URLSearchParams([
          ["initiative", active.initiative.id],
          ["participant", parts[3]],
          ...["shared", "focus", "depth", "sharedOnly"].flatMap((name) =>
            params.get(name) ? [[name, params.get(name)!]] : [],
          ),
        ])}`
      : undefined;

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
  const lookup = useDebounced(search.trim());
  const matches = useRemote<
    {
      id: string;
      name: string;
      jobTitle: string | null;
      companyId: string;
      companyName: string;
      departmentName?: string | null;
      initiativeId?: string | null;
      initiativeName?: string | null;
      decisionMaker?: boolean;
    }[]
  >(
    server && lookup.length >= 2
      ? `/contacts/search?${new URLSearchParams({ q: lookup })}`
      : null,
  );
  const searchPeople =
    data && !server && search.trim()
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
          href="/"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            go("/");
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
        </div>
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
            <GitMerge size={19} />
            Связи проектов
          </button>
          <button
            className={isClient && tab === "requests" ? "active" : ""}
            disabled={!companies.length}
            onClick={() => quickRoute("requests")}
          >
            <MessageSquareText size={19} />
            Запросы
          </button>
        </nav>
        {active && (contactDetail || ["overview", "history", "projects"].includes(tab)) && (
          <label className="sidebar-project">
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
        {server && (
          <button
            type="button"
            className="sidebar-ai"
            onClick={() => {
              setMobileNav(false);
              setModelOpen(true);
            }}
          >
            <Settings2 size={18} /> Настройки ИИ
          </button>
        )}
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
              maxLength={120}
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
                {searchPeople.map((person) => {
                  const item = data?.initiatives.find(({ graph }) =>
                    graph.nodes.some((node) => node.id === person.id),
                  );
                  if (!item) return null;
                  const { companyId, id } = item.initiative;
                  return (
                    <div className="search-contact-result" key={person.id}>
                      <button onClick={() => fullPerson(id, person.id)}>
                        <Users size={17} />
                        <span>
                          {person.name}{person.decisionMaker && " · ЛПР"}
                          <small>{[person.jobTitle, person.department?.name].filter(Boolean).join(" · ") || "Контакт"}</small>
                        </span>
                      </button>
                      <button className="search-map-action" title={item.initiative.name}
                        onClick={() => go(`/client/${companyId}/map?initiative=${id}&focus=${person.id}`)}>
                        На карте
                      </button>
                    </div>
                  );
                })}
                {lookup === search.trim() &&
                  matches.data?.map((entry) => (
                    <div className="search-contact-result" key={entry.id}>
                      <button onClick={() => directoryPerson(entry.companyId, entry.id)}>
                        {entry.decisionMaker ? (
                          <ContactPortrait personId={entry.id} size={30} />
                        ) : <Users size={17} />}
                        <span>
                          {entry.name}{entry.decisionMaker && " · ЛПР"}
                          <small>{[entry.companyName, entry.jobTitle, entry.departmentName].filter(Boolean).join(" · ")}</small>
                        </span>
                      </button>
                      {entry.initiativeId && (
                        <button
                          className="search-map-action"
                          title={entry.initiativeName ?? undefined}
                          onClick={() => go(`/client/${entry.companyId}/map?initiative=${entry.initiativeId}&focus=${entry.id}`)}
                        >
                          На карте
                        </button>
                      )}
                    </div>
                  ))}
                {server && lookup === search.trim() && matches.error && (
                  <p role="alert">{matches.error}</p>
                )}
                {!searchCompanies.length &&
                  !searchPeople.length &&
                  !matches.data?.length && (
                    <p>
                      {server && search.trim().length < 2
                        ? "Введите два символа для поиска контактов"
                        : matches.loading || lookup !== search.trim()
                          ? "Ищем…"
                          : "Ничего не найдено"}
                    </p>
                  )}
              </div>
            )}
          </div>

          <button
            className="secondary crm-import-trigger"
            disabled={!data?.capabilities.canImportContacts}
            onClick={() => setImportOpen(true)}
          >
            Импорт CSV
          </button>
        </header>
        <main
          className={`main-content${isClient ? " client-content client-" + tab : ""}`}
          aria-busy={workspace.loading}
        >
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
              ) : isClient && company ? (
                <>
                  <div className="page-title">
                    <div>
                      <h1>{company.name}</h1>
                      <p>
                        {company.industry ?? "Отрасль пока не указана"} ·
                        проектов: {items.length} · данные на{" "}
                        {formatDate(snapshot(items))}
                      </p>
                    </div>
                    {(canManage || canEdit) && (
                      <details
                        className="client-actions"
                        key={company.id + ":" + tab}
                        onClick={(event) => {
                          if ((event.target as Element).closest("button")) {
                            event.currentTarget.open = false;
                          }
                        }}
                      >
                        <summary className="secondary">
                          <Plus size={16} aria-hidden="true" /> Добавить
                          <ChevronDown size={14} aria-hidden="true" />
                        </summary>
                        <div className="client-action-menu">
                          {canManage && (
                            <button onClick={() => setEditor({ kind: "project", cid: company.id })}>
                              Новый проект
                            </button>
                          )}
                          {canEdit && (
                            <button
                              disabled={!active}
                              onClick={() => active && setForm({ iid: active.initiative.id })}
                            >
                              Взаимодействие
                            </button>
                          )}
                          {canManage && active && (tab === "map" || (tab === "contacts" && projectId)) && (
                            <button onClick={() => setEditor({ kind: "person", iid: active.initiative.id })}>
                              Новый участник
                            </button>
                          )}
                          {canManage && active && tab === "map" && (
                            <button
                              disabled={active.graph.nodes.length < 2}
                              onClick={() => setEditor({ kind: "relationship", iid: active.initiative.id })}
                            >
                              Добавить связь
                            </button>
                          )}
                          {canManage && active && tab === "contacts" && projectId && (
                            <button onClick={() => setEditor({ kind: "request", iid: active.initiative.id })}>
                              Запросить информацию
                            </button>
                          )}
                        </div>
                      </details>
                    )}
                  </div>
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
                        {item.icon && <item.icon size={16} />}
                        {item.label}
                      </button>
                    ))}
                  </nav>
                  {parts[2] === "directory" && parts[3] ? (
                    <DirectoryContact
                      companyId={company.id}
                      personId={parts[3]}
                      revision={workspace.revision}
                      go={go}
                    />
                  ) : parts[2] === "person" &&
                    parts[3] &&
                    workspace.loading &&
                    !active?.graph.nodes.some((entry) => entry.id === parts[3]) ? (
                    <p className="empty-inline" role="status">
                      Загружаем карточку…
                    </p>
                  ) : parts[2] === "person" && parts[3] ? (
                    <ContactPage
                      onRefresh={workspace.refresh}
                      item={active}
                      personId={parts[3]}
                      items={items}
                      dark={theme === "dark"}
                      canEdit={canEdit}
                      server={server}
                      go={go}
                      returnTo={mapReturn}
                      onEvent={() =>
                        active &&
                        setForm({ iid: active.initiative.id, pid: parts[3] })
                      }
                      onManage={canManage ? setEditor : undefined}
                    />
                  ) : (
                    <>
                      {!canEdit && tab === "overview" && (
                        <p className="read-only-note">
                          Доступен просмотр. Для добавления взаимодействий нужен
                          доступ редактора.
                        </p>
                      )}
                      {tab === "contacts" && items.length > 0 && (
                        <div className="scope-bar contact-scope">
                          <label>
                            Список контактов
                            <select
                              value={projectId ?? ""}
                              onChange={(event) => {
                                const initiative = event.target.value;
                                const scope = initiative
                                  ? `?${new URLSearchParams({ initiative })}`
                                  : "";
                                go(`/client/${company.id}/contacts${scope}`);
                              }}
                            >
                              <option value="">Все контакты компании</option>
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
                        </div>
                      )}
                      {tab === "overview" &&
                      server &&
                      !profile &&
                      workspace.loading ? (
                        <p className="empty-inline" role="status">
                          Загружаем компанию…
                        </p>
                      ) : tab === "overview" ? (
                        <>
                          <CompanyOverview
                            company={company}
                            items={items}
                            profile={profile}
                            latest={
                              data.companyEvents
                                ? historyEntries(data.companyEvents.items)
                                : undefined
                            }
                            onDirectory={(id) => directoryPerson(company.id, id)}
                            onPerson={openPerson}
                            onMap={() => go(`/client/${company.id}/map`)}
                          />
                          <ProjectIndex items={items} go={go} />
                        </>
                      ) : tab === "projects" ? (
                        <ProjectLinks
                          key={company.id + items.length}
                          items={items}
                          server={server}
                          go={go}
                          onPerson={fullPerson}
                          canManage={canManage}
                          onCreate={() =>
                            setEditor({ kind: "project", cid: company.id })
                          }
                        />
                      ) : tab === "history" ? (
                        server ? (
                          <PersistedPanel key={company.id} id={company.id + ".history"} title="Хронология">
                          <CompanyTimeline
                            key={company.id}
                            companyId={company.id}
                            initiatives={profile?.initiatives ?? []}
                            revision={workspace.revision}
                            onPerson={fullPerson}
                          />
                          </PersistedPanel>
                        ) : (
                          <PersistedPanel key={company.id} id={company.id + ".history"} title="Хронология">
                            <HistoryPanel entries={history(items)} onPerson={openPerson} />
                          </PersistedPanel>
                        )
                      ) : tab === "contacts" &&
                        !projectId &&
                        (profile || !server) ? (
                        <CompanyDirectory
                          key={company.id}
                          profile={profile}
                          localItems={server ? undefined : items}
                          days={days}
                          revision={workspace.revision}
                          onPerson={(id) => {
                            if (server) {
                              directoryPerson(company.id, id);
                            } else {
                              const project = items.find((item) =>
                                item.graph.nodes.some((person) => person.id === id),
                              );
                              if (project) openPerson(project.initiative.id, id);
                            }
                          }}
                        />
                      ) : workspace.loading &&
                        server &&
                        (!profile ||
                          !active ||
                          (tab === "map" && !active.graph.nodes.length)) ? (
                        <p className="empty-inline" role="status">
                          Загружаем раздел…
                        </p>
                      ) : tab === "insights" && !active && server ? (
                        <Insights
                          key={company.id}
                          companyId={company.id}
                          days={days}
                          facts={companyInsights}
                          server={server}
                          loading={workspace.loading}
                          revision={modelRevision}
                          go={go}
                          onContacts={() => go(`/client/${company.id}/contacts`)}
                        />
                      ) : !active ? (
                        <div className="empty-state">
                          <h2>Проекты пока не указаны</h2>
                          <p>Карта появится после добавления проектов.</p>
                        </div>
                      ) : (
                        <>
                          {tab !== "contacts" && (
                            <div className="scope-bar">
                              <label>
                                Проект
                                <select
                                  value={tab === "insights" ? params.get("initiative") ?? "" : active.initiative.id}
                                  onChange={(event) => {
                                    const id = event.target.value;
                                    go(`/client/${company.id}/${tab}${id ? `?initiative=${id}` : ""}`);
                                  }}
                                >
                                  {tab === "insights" && <option value="">Все проекты</option>}
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
                            </div>
                          )}
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
                              initialFocus={params.get("focus")}
                              initialDepartment={params.get("department")}
                              initialDepth={params.get("depth") === "2" ? 2 : 1}
                              initialSharedOnly={params.get("sharedOnly") !== "0"}
                              onlyIds={params.get("shared")?.split(",")}
                              darkTheme={theme === "dark"}
                              selectedId={
                                params.get("participant") ?? params.get("focus")
                              }
                              onSelect={(id, context) =>
                                mapPerson(active.initiative.id, id, context)
                              }
                              onEditRelationship={
                                canManage && server
                                  ? (edge) =>
                                      setEditor({
                                        kind: "relationship",
                                        iid: active.initiative.id,
                                        edgeId: edge.id,
                                      })
                                  : undefined
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
                              companyId={company.id}
                              initiativeScope={params.get("initiative") ?? undefined}
                              days={days}
                              facts={companyInsights}
                              server={server}
                              loading={workspace.loading}
                              revision={modelRevision}
                              go={go}
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
                  )}
                </>
              ) : isCompanies ? (
                <>
                  <div className="page-title">
                    <div>
                      <h1>Клиенты</h1>
                    </div>
                    <span className="total-label">
                      Всего: {companies.length}
                    </span>
                  </div>
                  <CompanyGrid
                    data={data}
                    collapsible
                    onOpen={(id) => go(`/client/${id}/overview`)}
                  />
                </>
              ) : (
                <Dashboard data={data} go={go} onPerson={openPerson} />
              )}
            </>
          )}
        </main>
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
            server={server}
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
        <ImportWorkspace
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
      {modelOpen && (
        <LocalModelDialog
          close={() => setModelOpen(false)}
          saved={() => setModelRevision((value) => value + 1)}
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
          server={server}
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

function ImportWorkspace({
  data,
  initialId,
  close,
  saved,
}: {
  data: WorkspaceData;
  initialId?: string;
  close: () => void;
  saved: (message: string) => void;
}) {
  const [id, setId] = useState(data.profile?.id ?? "");
  const projects = useRemote<Initiative[]>(
    data.capabilities.mode === "api" && id && id !== data.profile?.id
      ? `/companies/${id}/initiatives`
      : null,
  );
  const projectsByCompany =
    data.capabilities.mode === "api"
      ? (id === data.profile?.id
          ? (data.profile?.initiatives ?? [])
          : (projects.data ?? [])
        ).map((item) => emptyProject(item, 30))
      : data.initiatives;
  return (
    <CrmImport
      key={id + ":" + projectsByCompany.length}
      data={{ ...data, initiatives: projectsByCompany }}
      initialId={id === data.profile?.id ? initialId : undefined}
      companyId={data.capabilities.mode === "api" ? id : undefined}
      onCompany={setId}
      loading={projects.loading}
      loadError={projects.error}
      close={close}
      saved={saved}
    />
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
  const [showMoreRisks, setShowMoreRisks] = useState(false);
  const stats = portfolioStats(data);
  const riskItems =
    data.dashboard?.risks.map((entry) => ({
      key: `${entry.initiativeId}/${entry.code}/${entry.subjectId}`,
      companyId: entry.companyId,
      companyName: entry.companyName,
      initiativeId: entry.initiativeId,
      initiativeName: entry.initiativeName,
      text: riskLabel(entry),
    })) ??
    data.initiatives.flatMap((item) =>
      relationshipHealth(item.coverage).risks.map((text, index) => ({
        key: item.initiative.id + index,
        companyId: item.initiative.companyId,
        companyName: data.companies.find(
          (entry) => entry.id === item.initiative.companyId,
        )?.name,
        initiativeId: item.initiative.id,
        initiativeName: item.initiative.name,
        text,
      })),
    );
  const latest =
    data.dashboard?.recentInteractions?.map((entry) => ({
      ...entry,
      participants: [],
      outcome: null,
      nextStep: null,
      sourceLabel: null,
      responsibleManager: null,
    })) ?? history(data.initiatives);
  const metrics = [
    {
      label: "Компании",
      value: stats.companies,

    },
    {
      label: "Контакты",
      value: stats.contacts,

    },
    {
      label: "Взаимодействия",
      value: stats.events,

      note: "За 30 дней",
    },
    {
      label: "Замечания",
      value: stats.risks,

    },
  ];
  return (
    <div className="dashboard">
      <div className="page-title">
        <div>
          <h1>Работа с клиентами</h1>
        </div>
        <span className="snapshot-label">
          <CalendarDays size={16} />
          {formatDate(data.dashboard?.latestAsOf ?? snapshot(data.initiatives))}
        </span>
      </div>
      <section className="metric-grid" aria-label="Основные показатели">
        {metrics.map((metric) => (
          <div className="metric-card" key={metric.label}>
            <div>
              <span>{metric.label}</span>
            </div>
            <strong>{metric.value}</strong>
            {metric.note && <small>{metric.note}</small>}
          </div>
        ))}
      </section>
      <div className="section-heading outside">
        <div>
          <h2>Клиенты</h2>
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
            </div>
          </div>
          <div className="risk-list">
            {riskItems
              .slice(0, showMoreRisks ? 4 : 2)
              .map(
                ({
                  key,
                  companyId,
                  companyName,
                  initiativeId,
                  initiativeName,
                  text,
                }) => (
                  <button
                    key={key}
                    onClick={() =>
                      go(
                        `/client/${companyId}/insights?initiative=${initiativeId}`,
                      )
                    }
                  >
                    <span className="risk-dot" />
                    <div>
                      <strong>{text}</strong>
                      <small>
                        {companyName} · {initiativeName}
                      </small>
                    </div>
                    <ChevronRight size={17} />
                  </button>
                ),
              )}
            {!riskItems.length && (
              <p className="empty-inline">Замечаний по текущим данным нет.</p>
            )}
          </div>
          {riskItems.length > 2 && (
            <button
              type="button"
              className="text-button preview-more"
              aria-expanded={showMoreRisks}
              onClick={() => setShowMoreRisks(!showMoreRisks)}
            >
              {showMoreRisks ? "Свернуть замечания" : `Ещё ${Math.min(4, riskItems.length) - 2}`}
            </button>
          )}
        </section>
        <section className="surface">
          <div className="section-heading">
            <div>
              <h2>Последние взаимодействия</h2>
            </div>
            <CalendarDays size={19} />
          </div>
          <HistoryList entries={latest} onPerson={onPerson} compact previewCount={2} />
        </section>
      </div>
    </div>
  );
}
function CompanyGrid({
  data,
  onOpen,
  collapsible = false,
}: {
  data: WorkspaceData;
  onOpen: (id: string) => void;
  collapsible?: boolean;
}) {
  return data.companies.length ? (
    <div className="company-grid">
      {data.companies.map((company) => {
        const facts = data.dashboard?.companies?.find(
          (entry) => entry.companyId === company.id,
        );
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
        const card = (
          <button
            className="company-card surface"
            key={company.id}
            aria-label={`Открыть карточку компании ${company.name}`}
            onClick={() => onOpen(company.id)}
          >
            <div className="company-card-top">
              <span className="pill">
                Проектов: {facts?.initiativeCount ?? items.length}
              </span>
              <ChevronRight size={20} />
            </div>
            {collapsible ? <strong>Открыть карточку</strong> : <h3>{company.name}</h3>}
            <p>{company.industry ?? "Отрасль не указана"}</p>
            <div className="company-card-stats">
              <span>
                <Users size={16} />
                Контактов: {facts?.contactCount ?? people.length}
              </span>
              <span>
                <Building2 size={16} />
                Подразделений: {facts?.departmentCount ?? departments.size}
              </span>
            </div>
            <div className="company-card-footer">
              {!facts && (
                <span className={risks ? "attention-text" : ""}>
                  {risks ? `Замечаний: ${risks}` : "Нет замечаний"}
                </span>
              )}
              <small>
                Обновлено {formatDate(facts?.latestAsOf ?? snapshot(items))}
              </small>
            </div>
          </button>
        );
        return collapsible ? (
          <PersistedPanel key={company.id} id={company.id + ".card"} title={company.name}>
            {card}
          </PersistedPanel>
        ) : card;
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
  profile,
  latest,
  onDirectory,
  onPerson,
  onMap,
}: {
  company: Company;
  items: InitiativeData[];
  profile?: CompanyProfile;
  latest?: ReturnType<typeof historyEntries>;
  onDirectory: (pid: string) => void;
  onPerson: (iid: string, pid: string) => void;
  onMap: () => void;
}) {
  const people = uniquePeople(items),
    departments = profile?.departments ?? [
      ...new Map(
        people
          .filter((person) => person.department)
          .map((person) => [person.department!.id, person.department!]),
      ).values(),
    ];
  const keyPeople =
    profile?.keyContacts ??
    people.filter((person) =>
      items.some((item) =>
        item.graph.nodes.some((p) => p.id === person.id && p.decisionMaker),
      ),
    );
  return (
    <>
      <section className="company-summary surface">
        <div>
          <h2>О компании</h2>
          <p>{company.description ?? "Описание компании не заполнено."}</p>
          <button className="primary" disabled={!items.length} onClick={onMap}>
            <Network size={17} />
            Открыть карту связей
          </button>
        </div>
        <div className="company-facts">
          <div>
            <strong>{profile?.contactCount ?? people.length}</strong>
            <span>сотрудников</span>
          </div>
          <div>
            <strong>{departments.length}</strong>
            <span>подразделений</span>
          </div>
          <div>
            <strong>{items.length}</strong>
            <span>проектов</span>
          </div>
          <div>
            <strong>{formatDate(snapshot(items))}</strong>
            <span>последний срез</span>
          </div>
        </div>
      </section>
      <div className="overview-columns">
        <PersistedPanel key={company.id + ".departments"} id={company.id + ".departments"} title="Подразделения">
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
                    {!profile && (
                      <small>
                        Контактов: {members.length} · с недавним контактом:{" "}
                        {recent.length}
                      </small>
                    )}
                  </div>
                  {!profile && (
                    <span
                      className={
                        "status-tag " + (recent.length ? "RECENT" : "STALE")
                      }
                    >
                      {recent.length
                        ? "Есть контакт"
                        : "Нет недавних контактов"}
                    </span>
                  )}
                </div>
              );
            })}
            {!departments.length && (
              <p className="empty-inline">Подразделения пока не указаны.</p>
            )}
          </div>
        </PersistedPanel>
        <PersistedPanel key={company.id + ".leaders"} id={company.id + ".leaders"} title="Ключевые участники">
          <div className="key-people">
            {keyPeople.map((person) => {
              const item = items.find((item) =>
                item.graph.nodes.some(
                  (p) => p.id === person.id && p.decisionMaker,
                ),
              );
              return (
                <button
                  key={person.id}
                  onClick={() =>
                    profile
                      ? onDirectory(person.id)
                      : item && onPerson(item.initiative.id, person.id)
                  }
                >
                  <div className="overview-key-person">
                    <ContactPortrait personId={person.id} size={36} />
                    <span>
                    <strong>{person.name}</strong>
                    <small>{person.jobTitle ?? "Должность не указана"}</small>
                    </span>
                  </div>
                  <ChevronRight size={17} />
                </button>
              );
            })}
            {!keyPeople.length && (
              <p className="empty-inline">ЛПР пока не определены.</p>
            )}
          </div>
        </PersistedPanel>
      </div>
      <PersistedPanel key={company.id + ".latest"} id={company.id + ".latest"} title="Последние взаимодействия">
        <HistoryList
          entries={latest ?? history(items)}
          onPerson={onPerson}
          compact
          previewCount={2}
        />
      </PersistedPanel>
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
    <section className="surface project-contacts">
      <div className="section-heading">
        <div>
          <h2>
            Контакты проекта{" "}
            <span className="count-badge">{visible.length}</span>
          </h2>
        </div>
        <button className="secondary" disabled={!visible.length} onClick={copy}>
          <Copy size={16} />
          Список к встрече
        </button>
      </div>
      <ContactFilters item={item} value={filters} change={setFilters} />
      {visible.length ? (
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Контакты проекта"
        >
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
                          {person.decisionMaker && (
                            <ContactPortrait personId={person.id} size={36} />
                          )}
                          <span>
                            <span className="contact-identity">
                              <strong>{person.name}</strong>
                              {person.decisionMaker && (
                                <span className="decision-maker-label">
                                  ЛПР
                                </span>
                              )}
                            </span>
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
  companyId,
  initiativeScope,
  days,
  facts,
  server,
  loading,
  revision,
  go,
  onContacts,
}: {
  item?: InitiativeData;
  companyId: string;
  initiativeScope?: string;
  days: number;
  facts?: CompanyInsights;
  server: boolean;
  loading: boolean;
  revision: number;
  go: (path: string) => void;
  onContacts: () => void;
}) {
  const risks = facts?.risks ?? [];
  const [limit, setLimit] = useState(12);
  const fallback =
    item && !server ? relationshipHealth(item.coverage).risks : [];
  if (server && !facts) {
    return loading ? (
      <p className="empty-inline" role="status">
        Загружаем индекс отношений и сигналы риска…
      </p>
    ) : null;
  }
  return (
    <>
      {server && (
        <PersistedPanel id={companyId + ".lost-connections"} title="Потерянные связи">
          <LostConnections
            facts={facts}
            loading={loading}
            initiativeId={initiativeScope}
            onProject={(id) => go(`/client/${companyId}/map?initiative=${id}`)}
            onMap={(id, department) => {
              const query = new URLSearchParams({ initiative: id });
              if (department) query.set("department", department);
              go(`/client/${companyId}/map?${query}`);
            }}
            onContact={(id, initiative) => go(`/client/${companyId}/person/${id}?initiative=${initiative}`)}
          />
        </PersistedPanel>
      )}
      {item && (
        <PersistedPanel id={companyId + ".health"} title={`Индекс отношений · ${item.initiative.name}`}>
          <RelationshipHealth data={item.coverage} facts={item.health} server={server} />
        </PersistedPanel>
      )}
      <PersistedPanel id={companyId + ".risks"} title="Сигналы риска по компании" className="insights-panel">
        <div className="section-heading">
          <div>
            <p>
              {facts
                ? `Сигналов риска: ${facts.riskCount} · взаимодействий за ${days} дней: ${facts.activeInteractionCount}`
                : "По данным рабочего пространства"}
            </p>
          </div>
        </div>
        <div className="insight-grid">
          {risks.slice(0, limit).map((risk) => (
            <article
              key={`${risk.initiativeId}/${risk.code}/${risk.subjectId}`}
            >
              <h3>{riskLabel(risk)}</h3>
              <div className="insight-meta">
                <strong>{risk.initiativeName}</strong>
                <p>
                  {risk.lastObservedAt
                    ? `Последняя запись ${formatDate(risk.lastObservedAt)}`
                    : "В истории нет подходящей записи"}
                </p>
              </div>
            </article>
          ))}
          {fallback.map((risk) => (
            <article key={risk}>
              <h3>{risk}</h3>
              {item && (
                <div className="insight-meta">
                  <strong>{item.initiative.name}</strong>
                </div>
              )}
            </article>
          ))}
          {!risks.length && !fallback.length && (
            <p className="empty-inline">
              Замечаний по текущим данным нет. Добавляйте результаты встреч и
              звонков.
            </p>
          )}
        </div>
        <div className="section-actions">
          {risks.length > limit && (
            <button
              className="secondary"
              onClick={() => setLimit((value) => value + 12)}
            >
              Показать ещё
            </button>
          )}
          <button className="text-button" onClick={onContacts}>
            Посмотреть контакты <ChevronRight size={16} />
          </button>
        </div>
      </PersistedPanel>
      <Navigator
        key={`company-${companyId}-${days}-${revision}`}
        companyId={companyId}
        days={days}
        asOf={facts?.latestAsOf ?? item?.initiative.asOf ?? null}
        revision={revision}
      />
      {item && (
        <Navigator
          key={`project-${item.initiative.id}-${days}-${revision}`}
          initiativeId={item.initiative.id}
          days={days}
          asOf={item.initiative.asOf}
          revision={revision}
        />
      )}
    </>
  );
}
