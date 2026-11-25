import { useState } from "react";
import {
  CalendarDays,
  Search,
} from "lucide-react";
import { formatDate } from "./coverage";
import type { HistoryEntry } from "./workspace";

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
}: {
  entries: HistoryEntry[];
  onPerson: (iid: string, pid: string) => void;
  compact?: boolean;
}) {
  const [limit, setLimit] = useState(10);
  return entries.length ? (
    <>
      <ol className={"activity-list" + (compact ? " compact" : "")}>
        {entries.slice(0, compact ? 4 : limit).map((event) => {
          return (
            <li key={event.id}>
              <div className="activity-content">
                <div className="activity-meta">
                  <span>{eventLabels[event.type] ?? event.type}</span>
                  <time dateTime={event.occurredAt}>
                    {formatDate(event.occurredAt)}
                  </time>
                </div>
                <h3>{event.subject}</h3>
                <p className="activity-context">
                  {event.initiativeName} · {event.team}
                </p>
                {!compact && (
                  <>
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
                    {event.outcome && (
                      <p>
                        <b>
                          {event.type === "NOTE" ? "Комментарий" : "Результат"}:
                        </b>{" "}
                        {event.outcome}
                      </p>
                    )}
                    {event.nextStep && (
                      <p className="next-step">
                        <b>Следующий шаг:</b> {event.nextStep}
                      </p>
                    )}
                    <small>
                      Ответственный: {event.responsibleManager ?? "Не указан"} ·{" "}
                      {event.sourceLabel ?? "Источник не указан"}
                    </small>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {!compact && entries.length > limit && (
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
    <section className="surface">
      <div className="section-heading">
        <div>
          <h2>История работы с клиентом</h2>
          <p>Встречи, переписка и договорённости.</p>
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
