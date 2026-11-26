import { useId, useMemo, useState } from "react";
import { ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import { useDebounced, useRemote } from "./api";
import type {
  CompanyContact,
  CompanyProfile,
  ContactSummary,
} from "./companyApi";
import { formatDate } from "./coverage";
import { history, influenceLabels, type InitiativeData } from "./workspace";
import { CompanyTimeline } from "./History";
import { DecisionMakerFilter } from "./ContactFilters";
import { ContactPortrait } from "./ContactPortrait";

type LocalContact = ContactSummary & { email: string | null };

function localDirectory(items: InitiativeData[]) {
  const contacts = new Map<string, LocalContact>();
  const managers = new Map<string, string>();
  for (const event of history(items)) {
    if (!event.responsibleManager) continue;
    for (const person of event.participants) {
      if (!managers.has(person.id))
        managers.set(person.id, event.responsibleManager);
    }
  }
  const influenceRank = { UNKNOWN: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
  for (const item of items) {
    const coverage = new Map(
      item.coverage.contacts.map((entry) => [entry.id, entry]),
    );
    for (const person of item.graph.nodes) {
      const previous = contacts.get(person.id);
      const touch = coverage.get(person.id);
      const lastInteraction = touch?.lastTouchAt ?? null;
      const latest = Boolean(
        lastInteraction &&
          (!previous?.lastInteractionAt ||
            Date.parse(lastInteraction) >
              Date.parse(previous.lastInteractionAt)),
      );
      const roles = previous?.roles ?? [];
      const influence = person.influence ?? "UNKNOWN";
      contacts.set(person.id, {
        id: person.id,
        name: person.name,
        email: person.email ?? previous?.email ?? null,
        jobTitle: person.jobTitle ?? previous?.jobTitle ?? null,
        department: person.department ?? previous?.department ?? null,
        roles:
          person.role && !roles.some((role) => role.code === person.role?.code)
            ? [...roles, person.role]
            : roles,
        influence:
          previous &&
          influenceRank[previous.influence] > influenceRank[influence]
            ? previous.influence
            : influence,
        decisionMaker: person.decisionMaker || !!previous?.decisionMaker,
        lastInteractionAt: latest
          ? lastInteraction
          : (previous?.lastInteractionAt ?? null),
        interaction:
          (latest ? touch?.touchStatus : previous?.interaction) ?? "UNKNOWN",
        responsibleManager: managers.get(person.id) ?? null,
      });
    }
  }
  return [...contacts.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "ru"),
  );
}

export function CompanyDirectory({
  profile,
  localItems,
  days,
  revision,
  onPerson,
}: {
  profile?: CompanyProfile;
  localItems?: InitiativeData[];
  days: number;
  revision: number;
  onPerson: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [influence, setInfluence] = useState("");
  const [interaction, setInteraction] = useState("");
  const [role, setRole] = useState("");
  const [job, setJob] = useState("");
  const [manager, setManager] = useState("");
  const [decisionMaker, setDecisionMaker] = useState(false);
  const [offset, setOffset] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const filterPanel = useId();
  const extraFilterCount = [influence, interaction, role, job, manager].filter(Boolean).length;
  const filters = new URLSearchParams({ days: String(days) });
  const query = useDebounced(search.trim());
  const jobTitle = useDebounced(job.trim());
  const responsibleManager = useDebounced(manager.trim());
  for (const [key, value] of Object.entries({
    q: query,
    departmentId: department,
    influence,
    interaction,
    roleCode: role,
    jobTitle,
    responsibleManager,
    decisionMaker: decisionMaker ? "true" : "",
  })) {
    if (value) filters.set(key, value);
  }
  const pageSize = 24;
  filters.set("limit", String(pageSize));
  filters.set("offset", String(offset));
  const contacts = useRemote<{ items: ContactSummary[]; total: number }>(
    profile ? `/companies/${profile.id}/contacts?${filters}` : null,
    revision,
  );
  const localContacts = useMemo(
    () => localDirectory(localItems ?? []),
    [localItems],
  );
  const includes = (value: string | null, term: string) =>
    !term ||
    (value ?? "")
      .toLocaleLowerCase("ru")
      .includes(term.toLocaleLowerCase("ru"));
  const visible = localItems
    ? localContacts.filter(
        (entry) =>
          (!decisionMaker || entry.decisionMaker) &&
          (!department || entry.department?.id === department) &&
          (!influence || entry.influence === influence) &&
          (!interaction || entry.interaction === interaction) &&
          (!role || entry.roles.some((entry) => entry.code === role)) &&
          (includes(entry.name, query) || includes(entry.email, query)) &&
          includes(entry.jobTitle, jobTitle) &&
          includes(entry.responsibleManager, responsibleManager),
      )
    : undefined;
  const page = visible
    ? { items: visible.slice(offset, offset + pageSize), total: visible.length }
    : contacts.data;
  const roles = profile?.roles ?? [
    ...new Map(
      localContacts.flatMap((entry) =>
        entry.roles.map((role) => [role.code, role]),
      ),
    ).values(),
  ];
  const departments = profile?.departments ?? [
    ...new Map(
      localContacts.flatMap(({ department }) =>
        department ? [[department.id, department] as const] : [],
      ),
    ).values(),
  ];
  return (
    <section className="surface company-directory">
      <div className="section-heading">
        <h2>Контакты компании</h2>
        <span className="count-badge">
          {page?.total ??
            (contacts.loading ? "…" : (profile?.contactCount ?? 0))}
        </span>
      </div>
      <div className="filter-grid directory-filters">
        <label className="search-control">
          <span>Сотрудник</span>
          <div>
            <Search size={17} />
            <input
              type="search"
              placeholder="Имя или рабочая почта"
              maxLength={120}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setOffset(0);
              }}
            />
          </div>
        </label>
        <DecisionMakerFilter
          active={decisionMaker}
          onToggle={() => {
            setDecisionMaker(!decisionMaker);
            setOffset(0);
          }}
        />
        <label>
          Подразделение
          <select
            value={department}
            onChange={(event) => {
              setDepartment(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">Все отделы</option>
            {departments.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary directory-filter-toggle"
          type="button"
          aria-expanded={showFilters}
          aria-controls={filterPanel}
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          Фильтры{extraFilterCount ? ` · ${extraFilterCount}` : ""}
        </button>
      </div>
      <div className="directory-options" id={filterPanel} hidden={!showFilters}>
        <div className="filter-grid directory-extra-filters">
          <label>
            Влияние
            <select
              value={influence}
              onChange={(event) => {
                setInfluence(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">Любое</option>
              {Object.entries(influenceLabels).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Общение
            <select
              value={interaction}
              onChange={(event) => {
                setInteraction(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">Вся история</option>
              <option value="RECENT">Недавнее</option>
              <option value="STALE">Давнее</option>
              <option value="UNKNOWN">Без записей</option>
            </select>
          </label>
          {roles.length > 0 && (
            <label>
              Роль
              <select
                value={role}
                onChange={(event) => {
                  setRole(event.target.value);
                  setOffset(0);
                }}
              >
                <option value="">Все роли</option>
                {roles.map(({ code, label }) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Должность
            <input
              value={job}
              maxLength={160}
              onChange={(event) => {
                setJob(event.target.value);
                setOffset(0);
              }}
            />
          </label>
          <label>
            Ответственный менеджер
            <input
              value={manager}
              maxLength={160}
              onChange={(event) => {
                setManager(event.target.value);
                setOffset(0);
              }}
            />
          </label>
        </div>
        <label className="directory-columns-toggle">
          <input
            type="checkbox"
            checked={showColumns}
            onChange={(event) => setShowColumns(event.target.checked)}
          />
          Показать столбцы «Влияние» и «Менеджер»
        </label>
      </div>
      {contacts.loading && (
        <p className="empty-inline" role="status">
          Загружаем контакты…
        </p>
      )}
      {contacts.error && (
        <p className="empty-inline" role="alert">
          {contacts.error}
        </p>
      )}
      {page &&
        (page.items.length ? (
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Контакты компании"
          >
            <table className="directory-table" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  <th>Сотрудник</th>
                  <th>Подразделение</th>
                  <th>Роли</th>
                  {showColumns && <th>Влияние</th>}
                  <th>Последнее общение</th>
                  {showColumns && <th>Менеджер</th>}
                </tr>
              </thead>
              <tbody role="rowgroup">
                {page.items.map((entry) => (
                  <tr key={entry.id} role="row">
                    <td role="cell">
                      <button
                        className="person-button"
                        onClick={() => onPerson(entry.id)}
                      >
                        {entry.decisionMaker && (
                          <ContactPortrait personId={entry.id} size={36} />
                        )}
                        <span>
                          <span className="contact-identity">
                            <strong>{entry.name}</strong>
                            {entry.decisionMaker && (
                              <span className="decision-maker-label">ЛПР</span>
                            )}
                          </span>
                          <small>
                            {entry.jobTitle ?? "Должность не указана"}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td role="cell" data-label="Подразделение">{entry.department?.name ?? "—"}</td>
                    <td role="cell" data-label="Роли">
                      {entry.roles.map((item) => item.label).join(", ") || "—"}
                    </td>
                    {showColumns && (
                      <td role="cell" data-label="Влияние">{influenceLabels[entry.influence]}</td>
                    )}
                    <td role="cell" data-label="Последнее общение">{formatDate(entry.lastInteractionAt)}</td>
                    {showColumns && (
                      <td role="cell" data-label="Менеджер">{entry.responsibleManager ?? "—"}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-inline">Контакты по этим фильтрам не найдены.</p>
        ))}
      {page && (offset > 0 || page.total > pageSize) && (
        <div className="table-pagination">
          <button
            className="secondary"
            disabled={offset === 0}
            onClick={() => setOffset(offset - pageSize)}
          >
            Назад
          </button>
          <span>Всего {page.total}</span>
          <button
            className="secondary"
            disabled={offset + pageSize >= page.total}
            onClick={() => setOffset(offset + pageSize)}
          >
            Далее
          </button>
        </div>
      )}
    </section>
  );
}

export function DirectoryContact({
  companyId,
  personId,
  revision,
  go,
}: {
  companyId: string;
  personId: string;
  revision: number;
  go: (path: string) => void;
}) {
  const remote = useRemote<CompanyContact>(
    `/companies/${companyId}/contacts/${personId}`,
    revision,
  );
  const item = remote.data;
  const base = `/client/${companyId}`;
  return (
    <>
      <div className="page-title">
        <div>
          <button
            className="text-button"
            onClick={() => go(base + "/contacts")}
          >
            ← Контакты компании
          </button>
          <div className="profile-portrait-heading">
            {item?.decisionMaker && (
              <ContactPortrait personId={item.id} size={56} />
            )}
            <div>
              <h2 className="client-profile-title">{item?.name ?? "Карточка контакта"}</h2>
              {item?.jobTitle && <p>{item.jobTitle}</p>}
              {item?.decisionMaker && <span className="pill">ЛПР</span>}
            </div>
          </div>
        </div>
        {item && <button className="primary" onClick={() => go(item.assignments[0]
          ? `${base}/map?initiative=${item.assignments[0].initiativeId}&focus=${item.id}`
          : `${base}/map`)}>
          {item.assignments.length ? "Показать на карте" : "Карта компании"}
        </button>}
      </div>
      {remote.loading && <p role="status">Загружаем карточку…</p>}
      {remote.error && <p role="alert">{remote.error}</p>}
      {item && (
        <>
          <div className="overview-columns">
            <section className="surface">
              <div className="section-heading">
                <h2>Данные контакта</h2>
              </div>
              <dl className="directory-contact-facts">
                <div>
                  <dt>Подразделение</dt>
                  <dd>{item.department?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt>Роль</dt>
                  <dd>
                    {item.roles.map((entry) => entry.label).join(", ") || "—"}
                  </dd>
                </div>
                <div>
                  <dt>Влияние</dt>
                  <dd>{influenceLabels[item.influence]}</dd>
                </div>
                <div>
                  <dt>Почта</dt>
                  <dd>{item.email ?? "—"}</dd>
                </div>
                <div>
                  <dt>Телефон</dt>
                  <dd>{item.phone ?? "—"}</dd>
                </div>
                <div>
                  <dt>Последний контакт</dt>
                  <dd>{formatDate(item.lastInteractionAt)}</dd>
                </div>
                <div><dt>Ответственный менеджер</dt><dd>{item.responsibleManager ?? "Не назначен"}</dd></div>
              </dl>
            </section>
            <section className="surface">
              <div className="section-heading">
                <h2>Проекты и связи</h2>
              </div>
              <div className="key-people">
                {item.assignments.map((entry) => (
                  <div className="directory-project-actions" key={entry.initiativeId}><button
                    onClick={() =>
                      go(
                        `${base}/person/${item.id}?initiative=${entry.initiativeId}`,
                      )
                    }
                  >
                    <strong>{entry.initiativeName}</strong>
                    {entry.role && <small>{entry.role.label}</small>}
                    <ChevronRight size={16} />
                  </button><button className="text-button" onClick={() => go(`${base}/map?initiative=${entry.initiativeId}&focus=${item.id}`)}>На карте</button></div>
                ))}
                {item.connections.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => go(`${base}/directory/${entry.contactId}`)}
                  >
                    <span>
                      <strong>{entry.name}</strong>
                      <small>{entry.label}</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
                {!item.assignments.length && !item.connections.length && (
                  <p className="empty-inline">
                    Контакт пока не включён в проект. Его можно добавить в проект через импорт или открыть карту компании.
                  </p>
                )}
              </div>
            </section>
          </div>
          <CompanyTimeline
            companyId={companyId}
            initiatives={[]}
            revision={revision}
            personId={personId}
            onPerson={(iid, pid) =>
              go(`${base}/person/${pid}?initiative=${iid}`)
            }
          />
        </>
      )}
    </>
  );
}
