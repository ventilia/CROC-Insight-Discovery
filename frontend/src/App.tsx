import { useEffect, useRef, useState } from "react";
import { ArrowRight, Building2, ChevronDown, Clock3, Copy, Network, X } from "lucide-react";
import { useRemote, type Company, type Dossier, type EventPage, type Initiative } from "./api";
import {
  formatDate, meetingBrief, selectContacts, summarizeCoverage,
  type ContactCoverage, type ContactFilter, type Coverage, type Recency,
} from "./coverage";

const filters: { key: ContactFilter; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "stale", label: "Давнее касание" },
  { key: "unknown", label: "Нет записей" },
  { key: "verification", label: "Проверить ЛПР" },
];

const touchLabels: Record<Recency, string> = {
  RECENT: "Недавнее касание",
  STALE: "Давнее касание",
  UNKNOWN: "Нет записей",
};

const verificationLabels: Record<Recency, string> = {
  RECENT: "Проверены",
  STALE: "Давняя проверка",
  UNKNOWN: "Нет проверки",
};

export function App() {
  const [companyId, setCompany] = useState("");
  const [initiativeId, setInitiative] = useState("");
  const [attempt, retry] = useState(0);
  const companies = useRemote<Company[]>("/companies", attempt);
  const company = companies.data?.find(({ id }) => id === companyId) ?? companies.data?.[0];
  const initiatives = useRemote<Initiative[]>(company ? "/companies/" + company.id + "/initiatives" : null, attempt);
  const initiative = initiatives.data?.find(({ id }) => id === initiativeId) ?? initiatives.data?.[0];
  const error = companies.error || initiatives.error;

  return (
    <div className="app">
      <header className="masthead">
        <div className="brand"><span className="brand-mark"><Network size={19} /></span> КРОК <span>Insight</span></div>
        <div className="mast-context"><Building2 size={16} /><span>{company?.name ?? "Клиенты"}</span></div>
      </header>
      <main className="workspace">
        <header className="page-head">
          <div>
            <h1>Детектор потерянных связей</h1>
            <p>Посмотрите давность зафиксированных касаний и проверок контактных данных.</p>
          </div>
          <div className="scope">
            <label><span id="company-label">Компания</span><span className="select"><select aria-labelledby="company-label" value={company?.id ?? ""} disabled={!company}
              onChange={(event) => { setCompany(event.target.value); setInitiative(""); }}>
              {companies.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select><ChevronDown size={15} /></span></label>
            <label><span id="initiative-label">Инициатива</span><span className="select"><select aria-labelledby="initiative-label" value={initiative?.id ?? ""} disabled={!initiative}
              onChange={(event) => setInitiative(event.target.value)}>
              {initiatives.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select><ChevronDown size={15} /></span></label>
          </div>
        </header>
        {error ? <Notice text={error} retry={() => retry(attempt + 1)} /> : initiative
          ? <Workspace key={initiative.id} initiative={initiative} />
          : <Notice text={companies.loading || initiatives.loading ? "Загружаем список инициатив…" : "Доступных инициатив пока нет."} />}
      </main>
    </div>
  );
}

function Workspace({ initiative }: { initiative: Initiative }) {
  const [days, setDays] = useState(7);
  const [filter, setFilter] = useState<ContactFilter>("all");
  const [departmentId, setDepartment] = useState<string | null>(null);
  const [personId, setPerson] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<{ selection: string; message: string }>();
  const [attempt, retry] = useState(0);
  const opener = useRef<HTMLButtonElement | null>(null);
  const contactsHeading = useRef<HTMLHeadingElement | null>(null);
  const result = useRemote<Coverage>("/initiatives/" + initiative.id + "/coverage?days=" + days, attempt);
  const data = result.data;
  const contacts = data ? selectContacts(data.contacts, filter, departmentId) : [];
  const summary = data ? summarizeCoverage(data.contacts) : null;
  const selected = data?.contacts.find(({ id }) => id === personId);
  const department = data?.departments.find(({ id }) => id === departmentId);
  const selection = [data?.asOf, days, filter, departmentId].join("|");

  async function copyBrief() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(meetingBrief(initiative.name, data.asOf, data.days, contacts));
      setClipboard({ selection, message: "Список скопирован" });
    } catch {
      setClipboard({ selection, message: "Не удалось скопировать список" });
    }
  }

  return (
    <>
      <div className="toolbar">
        <span className="snapshot"><Clock3 size={16} /> Срез на {formatDate(data?.asOf ?? initiative.asOf)}</span>
        <label className="period"><span id="period-label">Период касаний</span><span className="select"><select aria-labelledby="period-label" value={days}
          onChange={(event) => { setDays(Number(event.target.value)); setClipboard(undefined); }}>
          {[7, 14, 30, 60, 90].map((value) => <option key={value} value={value}>{value} дней</option>)}
        </select><ChevronDown size={15} /></span></label>
      </div>
      {result.error && <Notice text={result.error} retry={() => retry(attempt + 1)} />}
      {result.loading && <Notice text="Рассчитываем охват по истории касаний…" />}
      {data && summary && (
        <>
          <section className="summary" aria-label="Охват участников">
            <div className="summary-primary">
              <span>Охват за {data.days} дней</span>
              <div className="coverage-value"><strong>{summary.percent === null ? "—" : summary.percent + "%"}</strong>
                <small>{summary.recent} из {data.contacts.length} участников</small></div>
              <div className="meter" role="meter" aria-label="Охват за выбранный период" aria-valuemin={0} aria-valuemax={100}
                aria-valuenow={summary.percent ?? 0} aria-valuetext={summary.percent === null ? "Нет участников" : undefined}>
                <span style={{ width: (summary.percent ?? 0) + "%" }} />
              </div>
            </div>
            {summaryTiles(summary).map(({ value, label, status, key }) => (
              <button key={key} type="button" className="summary-stat" aria-pressed={filter === key}
                onClick={() => { setFilter(filter === key ? "all" : key); setDepartment(null); setClipboard(undefined); }}>
                <span><i className={"dot " + status} />{label}<ArrowRight size={14} className="stat-arrow" /></span>
                <strong>{value}</strong>
              </button>
            ))}
          </section>
          <div className="work-area">
            <section className="surface contacts" aria-labelledby="contacts-heading">
              <div className="surface-head">
                <div><h2 id="contacts-heading" ref={contactsHeading} tabIndex={-1}>Участники <span>{contacts.length}</span></h2>
                  <p>{department ? department.name : "Последние касания и свежесть контактных данных"}</p></div>
                <button type="button" className="secondary" disabled={!contacts.length} onClick={copyBrief}>
                  <Copy size={15} /> Список к встрече
                </button>
              </div>
              <div className="filters" aria-label="Фильтры участников">
                {filters.map(({ key, label }) => <button key={key} type="button" aria-pressed={filter === key}
                  onClick={() => { setFilter(key); setClipboard(undefined); }}>{label}</button>)}
                {department && <button type="button" className="department-filter" aria-label={"Снять фильтр " + department.name}
                  onClick={() => { setDepartment(null); setClipboard(undefined); }}>{department.name}<X size={14} /></button>}
              </div>
              <span className="copy-result" role="status">{clipboard?.selection === selection ? clipboard.message : ""}</span>
              {contacts.length > 0 ? <div className="table-scroll">
                <table>
                  <thead><tr><th scope="col">Контакт</th><th scope="col">Последнее касание</th><th scope="col">Данные</th></tr></thead>
                  <tbody>{contacts.map((person) => (
                    <tr key={person.id} className={selected?.id === person.id ? "selected" : ""}>
                      <td><button className="person-button" type="button" aria-expanded={selected?.id === person.id}
                        aria-controls={selected?.id === person.id ? "person-panel" : undefined}
                        onClick={(event) => { opener.current = event.currentTarget; setPerson(person.id); }}>
                        <span className="avatar" aria-hidden="true">{person.name.split(" ").slice(0, 2).map((part) => part[0]).join("")}</span>
                        <span><span className="person-name">{person.name}{person.decisionMaker && <small>ЛПР</small>}</span>
                          <span className="person-meta">{person.jobTitle ?? person.department?.name ?? "Должность не указана"}</span>
                        </span>
                      </button></td>
                      <td><Status value={person.touchStatus} label={touchLabels[person.touchStatus]} /><small className="cell-date">{formatDate(person.lastTouchAt)}</small></td>
                      <td><Status value={person.verificationStatus} label={verificationLabels[person.verificationStatus]} /><small className="cell-date">{formatDate(person.lastVerifiedAt)}</small></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div> : <Notice text={data.contacts.length ? "По выбранным фильтрам никого нет." : "В инициативе пока нет участников."}
                retry={data.contacts.length ? () => { setFilter("all"); setDepartment(null); } : undefined} label="Сбросить фильтры" />}
            </section>
            {selected ? <PersonPanel key={selected.id} initiativeId={initiative.id} asOf={data.asOf} person={selected}
              close={() => {
                setPerson(null);
                if (opener.current?.isConnected) opener.current.focus();
                else contactsHeading.current?.focus();
              }} />
              : <aside className="surface department-panel" aria-labelledby="departments-heading">
                <div className="surface-head"><div><h2 id="departments-heading">Подразделения</h2>
                  <p>Контакты за выбранный период</p></div></div>
                <div className="department-list">{data.departments.map((item) => (
                  <button key={item.id} type="button" aria-pressed={departmentId === item.id}
                    onClick={() => { setDepartment(departmentId === item.id ? null : item.id); setClipboard(undefined); }}>
                    <div className="dept-top"><strong>{item.name}</strong><span>{item.recentCount} / {item.participantCount}</span></div>
                    <div className="meter mini" aria-hidden="true"><span style={{ width: item.recentCount * 100 / item.participantCount + "%" }} /></div>
                    <small>{touchLabels[item.touchStatus]} · {formatDate(item.lastTouchAt)}</small>
                  </button>
                ))}</div>
                {!data.departments.length && <Notice text="Подразделения пока не указаны." />}
                <p className="aside-note">Данные ЛПР требуют проверки, если их не проверяли {data.verificationDays} дней или дата проверки не указана.</p>
              </aside>}
          </div>
        </>
      )}
    </>
  );
}

function summaryTiles(summary: ReturnType<typeof summarizeCoverage>) {
  return [
    { value: summary.stale, label: "Давние касания", status: "STALE", key: "stale" },
    { value: summary.unknown, label: "Нет записей", status: "UNKNOWN", key: "unknown" },
    { value: summary.verification, label: "Проверить ЛПР", status: "VERIFY", key: "verification" },
  ] as const;
}

function PersonPanel({ initiativeId, asOf, person, close }: {
  initiativeId: string; asOf: string; person: ContactCoverage; close: () => void;
}) {
  const heading = useRef<HTMLHeadingElement | null>(null);
  const path = "/initiatives/" + initiativeId;
  const dossier = useRemote<Dossier>(path + "/people/" + person.id);
  const events = useRemote<EventPage>(path + "/events?" + new URLSearchParams({ personId: person.id, limit: "3", through: asOf }));
  useEffect(() => { heading.current?.focus(); }, []);

  return <aside id="person-panel" className="surface department-panel" aria-labelledby="person-heading"
    onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
    <div className="surface-head">
      <div><h2 id="person-heading" ref={heading} tabIndex={-1}>{person.name}</h2>
        <p>{dossier.data?.person.role?.label ?? person.jobTitle ?? "Участник инициативы"}</p></div>
      <button type="button" className="icon-button" aria-label="Закрыть карточку" onClick={close}><X size={19} /></button>
    </div>
    <div className="person-panel">
      <div className="person-facts"><Status value={person.touchStatus} label={touchLabels[person.touchStatus]} /><span>{formatDate(person.lastTouchAt)}</span></div>
      <h3>Последние касания</h3>
      {events.error && <p role="alert">{events.error}</p>}
      {events.loading && <p role="status">Загружаем историю…</p>}
      {events.data?.items.length === 0 && <p>Для участника пока нет записей.</p>}
      {!!events.data?.items.length && <ol className="timeline">{events.data.items.map((item) => <li key={item.id}>
        <time dateTime={item.occurredAt}>{formatDate(item.occurredAt)}</time>
        <strong>{item.subject}</strong>
        {(item.nextStep ?? item.outcome) && <p>{item.nextStep ?? item.outcome}</p>}
      </li>)}</ol>}
    </div>
  </aside>;
}

function Status({ value, label }: { value: Recency; label: string }) {
  return <span className={"status " + value}><i className={"dot " + value} />{label}</span>;
}

function Notice({ text, retry, label = "Повторить" }: { text: string; retry?: () => void; label?: string }) {
  return <div className="notice" role="status">{text}{retry && <button type="button" className="secondary" onClick={retry}>{label}</button>}</div>;
}
