import { useState } from "react";
import { apiWrite, useRemote } from "./api";
import { formatDate } from "./coverage";
import { sharedContacts } from "./projectLinks";
import type { InitiativeData } from "./workspace";
export type InformationRequest = {
  id: string;
  personId: string | null;
  recipient: string;
  question: string;
  status: "DRAFT" | "DONE";
  createdAt: string;
};
export function Requests({
  item,
  canManage,
  onCreate,
  onPerson,
}: {
  item: InitiativeData;
  canManage: boolean;
  onCreate: () => void;
  onPerson: (iid: string, pid: string) => void;
}) {
  const [attempt, retry] = useState(0),
    [pending, setPending] = useState(""),
    [error, setError] = useState("");
  const remote = useRemote<InformationRequest[]>(
    canManage ? `/initiatives/${item.initiative.id}/requests` : null,
    attempt,
  );
  return (
    <section className="surface project-panel">
      <div className="section-heading">
        <div>
          <h2>Запросы информации</h2>
          <p>
            Черновики и уточнения по проекту. Отправка сообщений не подключена.
          </p>
        </div>
        <button className="primary" disabled={!canManage} onClick={onCreate}>
          Новый запрос
        </button>
      </div>
      {!canManage ? (
        <p className="empty-inline">
          Подключённый сервер не поддерживает сохранение запросов.
        </p>
      ) : remote.loading ? (
        <p className="empty-inline" role="status">
          Загружаем запросы…
        </p>
      ) : remote.error ? (
        <p role="alert" className="empty-inline">
          {remote.error}{" "}
          <button className="text-button" onClick={() => retry(attempt + 1)}>
            Повторить
          </button>
        </p>
      ) : !remote.data?.length ? (
        <p className="empty-inline">
          Запросов пока нет. Создайте черновик, если сведения о роли, связях или
          встрече требуют уточнения.
        </p>
      ) : (
        <ul className="request-list">
          {remote.data.map((r) => (
            <li key={r.id}>
              <div>
                <span className="pill">
                  {r.status === "DONE" ? "Уточнено" : "Черновик"}
                </span>
                <h3>{r.question}</h3>
                <p>
                  Адресат: {r.recipient} · {formatDate(r.createdAt)}
                </p>
                {r.personId && (
                  <button
                    className="text-button"
                    onClick={() => onPerson(item.initiative.id, r.personId!)}
                  >
                    {item.graph.nodes.find((p) => p.id === r.personId)?.name ??
                      "Карточка участника"}
                  </button>
                )}
              </div>
              <button
                className="secondary"
                disabled={!!pending}
                onClick={async () => {
                  setPending(r.id);
                  setError("");
                  try {
                    await apiWrite(
                      `/initiatives/${item.initiative.id}/requests/${r.id}`,
                      "PATCH",
                      { status: r.status === "DRAFT" ? "DONE" : "DRAFT" },
                    );
                    retry(attempt + 1);
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Не удалось изменить статус.",
                    );
                  } finally {
                    setPending("");
                  }
                }}
              >
                {r.status === "DRAFT"
                  ? "Отметить уточнённым"
                  : "Вернуть в черновики"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export function ProjectLinks({
  items,
  go,
  onPerson,
  onCreate,
  canManage,
}: {
  items: InitiativeData[];
  go: (path: string) => void;
  onPerson: (iid: string, pid: string) => void;
  onCreate: () => void;
  canManage: boolean;
}) {
  const [left, setLeft] = useState(items[0]?.initiative.id ?? ""),
    [right, setRight] = useState(items[1]?.initiative.id ?? "");
  const a = items.find((p) => p.initiative.id === left),
    b = items.find((p) => p.initiative.id === right),
    shared = a && b ? sharedContacts(a, b) : [];
  return (
    <section className="surface project-panel">
      <div className="section-heading">
        <div>
          <h2>Связи проектов</h2>
          <p>Общие участники и их роли в инициативах одной компании.</p>
        </div>
        <button className="secondary" onClick={onCreate} disabled={!canManage}>
          Новый проект
        </button>
      </div>
      {items.length < 2 ? (
        <p className="empty-inline">
          Для сравнения нужны два проекта компании.
        </p>
      ) : (
        <>
          <div className="project-bridge">
            {[
              ["Проект 1", a, left, setLeft, right],
              ["Проект 2", b, right, setRight, left],
            ].map(([label, p, id, set, exclude]) => {
              const item = p as InitiativeData | undefined;
              return (
                <article key={String(label)}>
                  <label>
                    {String(label)}
                    <select
                      value={String(id)}
                      onChange={(e) =>
                        (set as (v: string) => void)(e.target.value)
                      }
                    >
                      {items
                        .filter((x) => x.initiative.id !== exclude)
                        .map((x) => (
                          <option key={x.initiative.id} value={x.initiative.id}>
                            {x.initiative.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <p>
                    {item?.graph.nodes.length ?? 0} участников ·{" "}
                    {item?.initiative.stage ?? "Стадия не указана"}
                  </p>
                  <button
                    className="text-button"
                    disabled={!item}
                    onClick={() =>
                      go(
                        `/client/${item!.initiative.companyId}/map?initiative=${item!.initiative.id}`,
                      )
                    }
                  >
                    Открыть проект
                  </button>
                </article>
              );
            })}
          </div>
          <div className="section-heading">
            <h3>Общих участников: {shared.length}</h3>
            {!!shared.length && a && (
              <button
                className="secondary"
                onClick={() =>
                  go(
                    `/client/${a.initiative.companyId}/map?initiative=${a.initiative.id}&shared=${shared.map((s) => s.person.id).join(",")}`,
                  )
                }
              >
                Показать на карте
              </button>
            )}
          </div>
          {!!shared.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Участник</th>
                    <th>{a?.initiative.name}</th>
                    <th>{b?.initiative.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {shared.map(({ person, other }) => (
                    <tr key={person.id}>
                      <td>
                        <strong>{person.name}</strong>
                        <small className="table-detail">
                          {person.jobTitle}
                        </small>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => onPerson(a!.initiative.id, person.id)}
                        >
                          {person.role?.label ?? "Роль не указана"}
                        </button>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => onPerson(b!.initiative.id, person.id)}
                        >
                          {other.role?.label ?? "Роль не указана"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-inline">
              Общих участников в доступных записях нет.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function ProjectIndex({
  items,
  go,
}: {
  items: InitiativeData[];
  go: (path: string) => void;
}) {
  return (
    <section className="surface project-panel">
      <div className="section-heading">
        <div>
          <h2>Проекты компании</h2>
          <p>Ответственные, этапы и ближайшие шаги.</p>
        </div>
      </div>
      <div className="project-index">
        {items.map(({ initiative: i, graph }) => (
          <article key={i.id}>
            <h3>{i.name}</h3>
            <dl>
              <div>
                <dt>Стадия</dt>
                <dd>{i.stage ?? "Не указана"}</dd>
              </div>
              <div>
                <dt>Ответственный</dt>
                <dd>{i.owner ?? "Не назначен"}</dd>
              </div>
              <div>
                <dt>Срок</dt>
                <dd>{i.due ?? "Не указан"}</dd>
              </div>
              <div>
                <dt>Участников</dt>
                <dd>{graph.nodes.length}</dd>
              </div>
            </dl>
            <p>{i.nextStep ?? "Следующий шаг не указан"}</p>
            <button
              className="text-button"
              onClick={() =>
                go(`/client/${i.companyId}/map?initiative=${i.id}`)
              }
            >
              Открыть проект
            </button>
          </article>
        ))}
      </div>
      {!items.length && (
        <p className="empty-inline">Проекты пока не добавлены.</p>
      )}
    </section>
  );
}
