import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { useDebounced, useRemote } from "./api";
import type {
  CompanyContact,
  CompanyProfile,
  ContactSummary,
} from "./companyApi";
import { formatDate } from "./coverage";
import { influenceLabels } from "./workspace";
import { CompanyTimeline } from "./History";

export function CompanyDirectory({
  profile,
  days,
  revision,
  onPerson,
}: {
  profile: CompanyProfile;
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
  const [offset, setOffset] = useState(0);
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
  })) {
    if (value) filters.set(key, value);
  }
  const pageSize = 24;
  filters.set("limit", String(pageSize));
  filters.set("offset", String(offset));
  const contacts = useRemote<{ items: ContactSummary[]; total: number }>(
    `/companies/${profile.id}/contacts?${filters}`,
    revision,
  );
  const roles = profile.roles ?? [];
  return (
    <section className="surface company-directory">
      <div className="section-heading">
        <h2>Контакты компании</h2>
        <span className="count-badge">
          {contacts.data?.total ?? profile.contactCount}
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
        <label>
          Подразделение
          <select
            value={department}
            onChange={(event) => {
              setDepartment(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">Все подразделения</option>
            {profile.departments.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Влияние
          <select
            value={influence}
            onChange={(event) => {
              setInfluence(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">Любое влияние</option>
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
      {contacts.data &&
        (contacts.data.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Подразделение</th>
                  <th>Роли</th>
                  <th>Влияние</th>
                  <th>Последнее общение</th>
                  <th>Менеджер</th>
                </tr>
              </thead>
              <tbody>
                {contacts.data.items.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <button
                        className="person-button"
                        onClick={() => onPerson(entry.id)}
                      >
                        <span>
                          <strong>{entry.name}</strong>
                          <small>
                            {entry.jobTitle ?? "Должность не указана"}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>{entry.department?.name ?? "—"}</td>
                    <td>
                      {entry.roles.map((item) => item.label).join(", ") || "—"}
                    </td>
                    <td>{influenceLabels[entry.influence]}</td>
                    <td>{formatDate(entry.lastInteractionAt)}</td>
                    <td>{entry.responsibleManager ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-inline">Контакты по этим фильтрам не найдены.</p>
        ))}
      {contacts.data && (offset > 0 || contacts.data.total > pageSize) && (
        <div className="table-pagination">
          <button
            className="secondary"
            disabled={offset === 0}
            onClick={() => setOffset(offset - pageSize)}
          >
            Назад
          </button>
          <span>Всего {contacts.data.total}</span>
          <button
            className="secondary"
            disabled={offset + pageSize >= contacts.data.total}
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
          <h1>{item?.name ?? "Карточка контакта"}</h1>
          <p>{item?.jobTitle}</p>
        </div>
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
              </dl>
            </section>
            <section className="surface">
              <div className="section-heading">
                <h2>Проекты и связи</h2>
              </div>
              <div className="key-people">
                {item.assignments.map((entry) => (
                  <button
                    key={entry.initiativeId}
                    onClick={() =>
                      go(
                        `${base}/person/${item.id}?initiative=${entry.initiativeId}`,
                      )
                    }
                  >
                    <strong>{entry.initiativeName}</strong>
                    <ChevronRight size={16} />
                  </button>
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
                    Связи и проекты пока не указаны.
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
