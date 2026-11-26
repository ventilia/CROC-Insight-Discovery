import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Search } from "lucide-react";
import { formatDate } from "./coverage";
import type { HistoryEntry } from "./workspace";
import {
  api,
  useDebounced,
  type EventPage,
  type Initiative,
  type Touchpoint,
} from "./api";

export const eventLabels: Record<string, string> = {
  MEETING: "Встреча",
  CALL: "Звонок",
  EMAIL: "Письмо",
  NOTE: "Комментарий",
  PROPOSAL: "Предложение",
};
export function HistoryList({
  entries,
  onPerson,
  compact = false,
  paginated = false,
  dateColumn = false,
}: {
  entries: HistoryEntry[];
  onPerson: (iid: string, pid: string) => void;
  compact?: boolean;
  paginated?: boolean;
  dateColumn?: boolean;
}) {
  const [limit, setLimit] = useState(10);
  return entries.length ? (
    <>
      <ol className={"activity-list" + (compact ? " compact" : "")}>
        {entries
          .slice(0, compact ? 4 : paginated ? entries.length : limit)
          .map((event) => {
            const meta = (
              <div className={dateColumn ? "activity-date" : "activity-meta"}>
                {!dateColumn && (
                  <span>{eventLabels[event.type] ?? event.type}</span>
                )}
                <time dateTime={event.occurredAt}>
                  {formatDate(event.occurredAt)}
                </time>
                {dateColumn && (
                  <span>{eventLabels[event.type] ?? event.type}</span>
                )}
              </div>
            );
            return (
              <li key={event.id}>
                {dateColumn && meta}
                <div className="activity-content">
                  {!dateColumn && meta}
                  <h3>{event.subject}</h3>
                  <p className="activity-context">
                    {event.initiativeName} · {event.team}
                  </p>
                  {!compact && (
                    <>
                      {event.participants.length > 0 && (
                        <div className="activity-people">
                          {event.participants.map((person) => (
                            <button
                              key={person.id}
                              type="button"
                              onClick={() =>
                                onPerson(event.initiativeId, person.id)
                              }
                            >
                              {person.name}
                            </button>
                          ))}
                        </div>
                      )}
                      {event.outcome && (
                        <p>
                          <b>
                            {event.type === "NOTE"
                              ? "Комментарий"
                              : "Результат"}
                            :
                          </b>{" "}
                          {event.outcome}
                        </p>
                      )}
                      {event.nextStep && (
                        <p className="next-step">
                          <b>Следующий шаг:</b> {event.nextStep}
                        </p>
                      )}
                      {event.comment && (
                        <p>
                          <b>Комментарий</b> {event.comment}
                        </p>
                      )}
                      <small>
                        Ответственный: {event.responsibleManager ?? "Не указан"}{" "}
                        · {event.sourceLabel ?? "Источник не указан"}
                      </small>
                    </>
                  )}
                </div>
              </li>
            );
          })}
      </ol>
      {!compact && !paginated && entries.length > limit && (
        <button
          type="button"
          className="secondary load-more"
          onClick={() => setLimit(limit + 10)}
        >
          Показать ещё · {entries.length - limit}
        </button>
      )}
    </>
  ) : (
    <div className="empty-state">
      <CalendarDays size={30} />
      <h3>Записей пока нет</h3>
      <p>Добавьте встречу, звонок или договорённость.</p>
    </div>
  );
}

export function historyEntries(items: Touchpoint[]): HistoryEntry[] {
  return items.flatMap((item) =>
    item.initiativeId && item.initiativeName
      ? [
          {
            ...item,
            initiativeId: item.initiativeId,
            initiativeName: item.initiativeName,
          },
        ]
      : [],
  );
}

export function CompanyTimeline({
  companyId,
  initiatives,
  revision,
  onPerson,
  personId,
}: {
  companyId: string;
  initiatives: Initiative[];
  revision: number;
  onPerson: (iid: string, pid: string) => void;
  personId?: string;
}) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [manager, setManager] = useState("");
  const [project, setProject] = useState("");
  const query = useDebounced(search.trim());
  const responsibleManager = useDebounced(manager.trim());
  const through = useMemo(() => new Date().toISOString(), [revision]);
  const filters = new URLSearchParams({ limit: "20", through });
  for (const [key, value] of Object.entries({
    q: query,
    type,
    responsibleManager,
    initiativeId: project,
    personId,
  })) {
    if (value) filters.set(key, value);
  }
  const path = `/companies/${companyId}/events?${filters}`;
  return (
    <section className={personId ? "surface" : "surface history-surface"}>
      <div className="section-heading">
        <h2>{personId ? "История общения" : "История работы с клиентом"}</h2>
      </div>
      {!personId && (
        <div className="filter-grid history-filters">
          <label className="search-control">
            <span>Поиск по истории</span>
            <div>
              <Search size={17} />
              <input
                type="search"
                maxLength={120}
                value={search}
                placeholder="Тема, участник, договорённость"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </label>
          <label>
            Тип записи
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="">Все типы</option>
              {Object.entries(eventLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ответственный менеджер
            <input
              value={manager}
              maxLength={160}
              onChange={(event) => setManager(event.target.value)}
            />
          </label>
          <label>
            Проект в истории
            <select
              value={project}
              onChange={(event) => setProject(event.target.value)}
            >
              <option value="">Все проекты</option>
              {initiatives.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <TimelinePages
        key={path + ":" + revision}
        path={path}
        onPerson={onPerson}
        dateColumn={!personId}
      />
    </section>
  );
}

function TimelinePages({
  path,
  onPerson,
  dateColumn,
}: {
  path: string;
  onPerson: (iid: string, pid: string) => void;
  dateColumn: boolean;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [request, setRequest] = useState({
    cursor: null as string | null,
    attempt: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const url = request.cursor
      ? `${path}&cursor=${encodeURIComponent(request.cursor)}`
      : path;
    api<EventPage>(url, { signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return;
        setEntries((items) => [
          ...new Map(
            [...items, ...historyEntries(page.items)].map((item) => [
              item.id,
              item,
            ]),
          ).values(),
        ]);
        setNext(page.nextCursor !== request.cursor ? page.nextCursor : null);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : "История недоступна.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, request]);
  return (
    <>
      {(entries.length > 0 || (!loading && !error)) && (
        <HistoryList
          entries={entries}
          onPerson={onPerson}
          paginated
          dateColumn={dateColumn}
        />
      )}
      {loading && (
        <p className="empty-inline" role="status">
          Загружаем историю…
        </p>
      )}
      {error && (
        <p className="empty-inline" role="alert">
          {error}{" "}
          <button
            className="secondary"
            onClick={() =>
              setRequest({ ...request, attempt: request.attempt + 1 })
            }
          >
            Повторить
          </button>
        </p>
      )}
      {next && !loading && !error && (
        <button
          className="secondary load-more"
          onClick={() => setRequest({ cursor: next, attempt: 0 })}
        >
          Загрузить ещё
        </button>
      )}
    </>
  );
}

export function HistoryPanel({
  entries,
  onPerson,
}: {
  entries: HistoryEntry[];
  onPerson: (iid: string, pid: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [type, setType] = useState(""),
    [manager, setManager] = useState(""),
    [initiative, setInitiative] = useState("");
  const visible = entries.filter(
    (event) =>
      (!type || event.type === type) &&
      (!manager || event.responsibleManager === manager) &&
      (!initiative || event.initiativeId === initiative) &&
      [
        event.subject,
        event.outcome,
        event.nextStep,
        event.team,
        ...event.participants.map((person) => person.name),
      ].some((value) =>
        value
          ?.toLocaleLowerCase("ru")
          .includes(search.trim().toLocaleLowerCase("ru")),
      ),
  );
  const managers = [
    ...new Set(
      entries
        .map((event) => event.responsibleManager)
        .filter((value): value is string => !!value),
    ),
  ];
  const initiatives = [
    ...new Map(
      entries.map((event) => [event.initiativeId, event.initiativeName]),
    ).entries(),
  ];
  return (
    <section className="surface history-surface">
      <div className="section-heading">
        <div>
          <h2>История работы с клиентом</h2>
        </div>
        <span className="count-badge">{visible.length}</span>
      </div>
      <div className="filter-grid history-filters">
        <label className="search-control">
          <span>Поиск по истории</span>
          <div>
            <Search size={17} />
            <input
              type="search"
              value={search}
              placeholder="Тема, участник, договорённость"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </label>
        <label>
          Тип записи
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">Все типы</option>
            {Object.entries(eventLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ответственный менеджер
          <select
            value={manager}
            onChange={(event) => setManager(event.target.value)}
          >
            <option value="">Все менеджеры</option>
            {managers.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Проект в истории
          <select
            value={initiative}
            onChange={(event) => setInitiative(event.target.value)}
          >
            <option value="">Все проекты</option>
            {initiatives.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {visible.length || !entries.length ? (
        <HistoryList
          key={[search, type, manager, initiative].join("|")}
          entries={visible}
          onPerson={onPerson}
          dateColumn
        />
      ) : (
        <div className="empty-state">
          <h3>Совпадений нет</h3>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setSearch("");
              setType("");
              setManager("");
              setInitiative("");
            }}
          >
            Сбросить фильтры
          </button>
        </div>
      )}
    </section>
  );
}
