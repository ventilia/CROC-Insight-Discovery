import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  X,
  Mail,
  Phone,
  Link2,
  Plus,
  Copy,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { WorkspaceAction } from "./WorkspaceEdit";
import { useRemote, type Dossier, type EventPage, type Position } from "./api";
import type { CompanyContact } from "./companyApi";
import { PositionEditor, PositionSummary } from "./PositionEditor";
import { CompanyTimeline, HistoryList, historyEntries } from "./History";
import {
  history,
  influenceLabels,
  roleTone,
  type InitiativeData,
} from "./workspace";

export function ContactDrawer({
  item,
  personId,
  onPerson,
  close,
  onEvent,
  canEdit,
  presentation = "drawer",
  workspaceItems = [item],
  onFull,
  onMap,
  onManage,
  onRefresh,
  server = false,
}: {
  item: InitiativeData;
  personId: string;
  onPerson: (iid: string, pid: string) => void;
  close: () => void;
  onEvent: () => void;
  canEdit: boolean;
  presentation?: "drawer" | "page";
  workspaceItems?: InitiativeData[];
  onFull?: () => void;
  onRefresh?: () => void;
  server?: boolean;
  onMap?: () => void;
  onManage?: (action: WorkspaceAction) => void;
}) {
  const [attempt, retry] = useState(0),
    [editing, setEditing] = useState(false),
    [position, setPosition] = useState<Position | null>(null),
    [copied, setCopied] = useState("");
  const [section, setSection] = useState("bio");
  const heading = useRef<HTMLHeadingElement>(null);
  const person = item.graph.nodes.find((person) => person.id === personId)!;
  const coverage = item.coverage.contacts.find((p) => p.id === personId);
  const personIndex = item.graph.nodes.findIndex((p) => p.id === personId);
  const path = `/initiatives/${item.initiative.id}/people/${personId}`;
  const dossier = useRemote<Dossier>(path, attempt);
  const directoryPath = `/companies/${item.initiative.companyId}`;
  const companyContact = useRemote<CompanyContact>(
    server ? `${directoryPath}/contacts/${personId}` : null,
    attempt,
  );
  const recent = useRemote<EventPage>(
    server ? `${directoryPath}/events?personId=${personId}&limit=10` : null,
    attempt,
  );
  const linked = item.graph.edges.filter(
    (edge) => edge.source === personId || edge.target === personId,
  );
  const events = recent.data
    ? historyEntries(recent.data.items)
    : history([item]).filter((event) =>
        event.participants.some((p) => p.id === personId),
      );
  const assignments = server
    ? (companyContact.data?.assignments ?? [])
    : workspaceItems.flatMap((other) => {
        const contact = other.graph.nodes.find(
          (entry) => entry.id === personId,
        );
        return contact
          ? [
              {
                initiativeId: other.initiative.id,
                initiativeName: other.initiative.name,
                role: contact.role,
              },
            ]
          : [];
      });
  const otherProjects = assignments.filter(
    (entry) => entry.initiativeId !== item.initiative.id,
  );
  useEffect(() => {
    const opener = document.activeElement;
    heading.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [personId]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        [person.name, person.jobTitle, person.email, person.phone]
          .filter(Boolean)
          .join("\n"),
      );
      setCopied("Контакт скопирован");
    } catch {
      setCopied("Не удалось скопировать контакт");
    }
  }
  return (
    <aside
      className={
        "contact-drawer" + (presentation === "page" ? " full-profile" : "")
      }
      role={presentation === "drawer" ? "dialog" : undefined}
      aria-modal={presentation === "drawer" ? false : undefined}
      aria-labelledby="contact-drawer-title"
      onKeyDown={(event) => {
        if (presentation === "drawer" && event.key === "Escape") close();
      }}
    >
      {presentation === "drawer" && (
        <header className="drawer-header">
          <span>Профиль сотрудника</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Закрыть профиль"
            onClick={close}
          >
            <X size={21} />
          </button>
        </header>
      )}
      <div className="drawer-scroll">
        <div className="profile-hero">
          <div className="profile-identity">
            <h2 id="contact-drawer-title" ref={heading} tabIndex={-1}>
              {person.name}
            </h2>
            <p>{person.jobTitle ?? "Должность не указана"}</p>
            <span>{person.department?.name ?? "Подразделение не указано"}</span>
          </div>
          <div className="profile-badges">
            <span className={"role-badge tone-" + roleTone(person.role?.code)}>
              {person.role?.label ?? "Роль не указана"}
            </span>
            {person.decisionMaker && <span className="pill">ЛПР</span>}
          </div>
        </div>
        <div className="profile-actions">
          {onFull && (
            <button className="secondary" onClick={onFull}>
              Открыть карточку
            </button>
          )}
          {onMap && (
            <button className="secondary" onClick={onMap}>
              Окружение на карте
            </button>
          )}
          {onManage && (
            <>
              <button
                className="secondary"
                onClick={() =>
                  onManage({
                    kind: "edit",
                    iid: item.initiative.id,
                    pid: personId,
                  })
                }
              >
                Уточнить запись
              </button>
              <button
                className="secondary"
                onClick={() =>
                  onManage({
                    kind: "request",
                    iid: item.initiative.id,
                    pid: personId,
                  })
                }
              >
                Запросить информацию
              </button>
            </>
          )}

          <button type="button" className="secondary" onClick={copy}>
            <Copy size={14} />
            Копировать
          </button>
          {canEdit && (
            <button type="button" className="primary" onClick={onEvent}>
              <Plus size={14} />
              Взаимодействие
            </button>
          )}
        </div>
        <div className="profile-context-bar">
          <span className="copy-result" role="status">
            {copied}
          </span>
          <div className="person-pager" aria-label="Переход между контактами">
            <button
              type="button"
              className="icon-button"
              aria-label="Предыдущий контакт"
              disabled={personIndex <= 0}
              onClick={() =>
                onPerson(
                  item.initiative.id,
                  item.graph.nodes[personIndex - 1].id,
                )
              }
            >
              <ChevronLeft size={15} />
            </button>
            <span>
              {personIndex + 1} из {item.graph.nodes.length}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Следующий контакт"
              disabled={personIndex >= item.graph.nodes.length - 1}
              onClick={() =>
                onPerson(
                  item.initiative.id,
                  item.graph.nodes[personIndex + 1].id,
                )
              }
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
        <nav className="profile-tabs" aria-label="Разделы профиля">
          {[
            ["bio", "О человеке"],
            ["connections", `Связи · ${linked.length}`],
            ["history", `История · ${events.length}`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={section === key}
              aria-controls={`profile-${key}`}
              onClick={() => setSection(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div id="profile-bio" hidden={section !== "bio"}>
          <section className="profile-section profile-context-facts">
            <h3>Роль в проекте</h3>
            <strong>{person.role?.label ?? "Не указана"}</strong>
            {person.mandate && <p>Область решений: {person.mandate}</p>}
            <p>Ответственный КРОК: {item.initiative.owner ?? "Не назначен"}</p>
            <p>
              Входящих связей:{" "}
              {linked.filter((e) => e.target === personId).length} · исходящих:{" "}
              {linked.filter((e) => e.source === personId).length}
            </p>
            <h3>Что важно участнику</h3>
            <p>{person.interest ?? "Требует уточнения"}</p>
            <small>Источник: {person.sourceLabel ?? "Не указан"}</small>
          </section>

          <section className="profile-section">
            <h3>Контактная информация</h3>
            <p className="contact-line">
              <Mail size={16} />
              {person.email ? (
                <a href={"mailto:" + person.email}>{person.email}</a>
              ) : (
                "Email не указан"
              )}
            </p>
            <p className="contact-line">
              <Phone size={16} />
              {person.phone ? (
                <a href={"tel:" + person.phone}>{person.phone}</a>
              ) : (
                "Телефон не указан"
              )}
            </p>
          </section>
          <section className="profile-section">
            <h3>Влияние на решение</h3>
            <strong>{influenceLabels[person.influence ?? "UNKNOWN"]}</strong>
            <p>{person.influenceBasis ?? "Обоснование оценки не указано."}</p>
            <small>Проект: {item.initiative.name}</small>
          </section>
          <section className="profile-section">
            <h3>Отношение к проекту</h3>
            {dossier.loading ? (
              <p role="status">Загружаем позицию…</p>
            ) : dossier.error ? (
              <p role="alert">
                {dossier.error}{" "}
                <button
                  className="text-button"
                  onClick={() => retry(attempt + 1)}
                >
                  Повторить
                </button>
              </p>
            ) : (
              <PositionSummary
                position={position ?? dossier.data?.position ?? null}
              />
            )}
            <button
              type="button"
              className="secondary source-toggle"
              aria-expanded={editing}
              onClick={() => setEditing(!editing)}
            >
              {editing ? "Свернуть источник" : "Изменить оценку"}
            </button>
            {editing && (
              <PositionEditor
                path={path + "/demo-source"}
                onPositionChange={setPosition}
                onSaved={onRefresh}
              />
            )}
          </section>
        </div>
        <div id="profile-connections" hidden={section !== "connections"}>
          {onManage && (
            <div className="profile-actions">
              <button
                className="secondary"
                disabled={item.graph.nodes.length < 2}
                onClick={() =>
                  onManage({
                    kind: "relationship",
                    iid: item.initiative.id,
                    pid: personId,
                  })
                }
              >
                Добавить связь
              </button>
            </div>
          )}

          <section className="profile-section">
            <h3>
              <Link2 size={17} />
              Связанные сотрудники <span>{linked.length}</span>
            </h3>
            {linked.length ? (
              <div className="linked-people">
                {linked.map((edge) => {
                  const outgoing = edge.source === personId;
                  const Direction = outgoing ? ArrowUpRight : ArrowDownLeft;
                  const other = item.graph.nodes.find(
                    (p) => p.id === (outgoing ? edge.target : edge.source),
                  );
                  return (
                    other && (
                      <button
                        type="button"
                        key={edge.id}
                        onClick={() => onPerson(item.initiative.id, other.id)}
                      >
                        <strong>{other.name}</strong>
                        <span className="profile-link-direction">
                          <Direction size={13} aria-hidden="true" />
                          {outgoing ? "Исходящая" : "Входящая"} связь ·{" "}
                          {edge.confirmed ? "Подтверждена" : "Требует проверки"}
                        </span>
                        <p>{edge.label}</p>
                        <small>
                          Основание: {edge.sourceLabel ?? "Не указано"}
                        </small>
                      </button>
                    )
                  );
                })}
              </div>
            ) : (
              <p>Связи не указаны.</p>
            )}
          </section>
        </div>
        <div id="profile-history" hidden={section !== "history"}>
          <section className="profile-section">
            <div className="inline-heading">
              <h3>История взаимодействий</h3>
              {canEdit && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Добавить взаимодействие с контактом"
                  onClick={onEvent}
                >
                  <Plus size={17} />
                </button>
              )}
            </div>
            {coverage?.verificationStatus !== "RECENT" &&
              person.decisionMaker && (
                <p className="attention-note">
                  Проверьте актуальность данных ЛПР.
                </p>
              )}
            {server ? (
              <CompanyTimeline
                companyId={item.initiative.companyId}
                initiatives={[]}
                revision={attempt}
                personId={personId}
                onPerson={onPerson}
              />
            ) : (
              <HistoryList entries={events} onPerson={onPerson} />
            )}
          </section>
        </div>
        {events[0] && (
          <section className="profile-section">
            <h3>Последнее взаимодействие</h3>
            <strong>{events[0].subject}</strong>
            <p>{events[0].outcome ?? "Результат не указан"}</p>
            <small>
              {new Date(events[0].occurredAt).toLocaleDateString("ru-RU")} ·{" "}
              {events[0].responsibleManager ??
                events[0].author ??
                "Ответственный не указан"}
            </small>
            <button
              className="text-button"
              onClick={() => setSection("history")}
            >
              Открыть историю
            </button>
          </section>
        )}
        {events.some((e) => e.nextStep) && (
          <section className="profile-section">
            <h3>Зафиксированные шаги</h3>
            <ul className="profile-next-steps">
              {events
                .filter((e) => e.nextStep)
                .slice(0, 5)
                .map((e) => (
                  <li key={e.id}>
                    {e.nextStep}
                    <small>
                      {e.responsibleManager ?? "Ответственный не указан"} ·{" "}
                      {new Date(e.occurredAt).toLocaleDateString("ru-RU")}
                    </small>
                  </li>
                ))}
            </ul>
          </section>
        )}
        <section className="profile-section">
          <h3>Участие в других проектах</h3>
          {otherProjects.map((other) => (
            <div key={other.initiativeId}>
              <button
                className="text-button"
                onClick={() => onPerson(other.initiativeId, personId)}
              >
                {other.initiativeName}
              </button>
              <p>{other.role?.label ?? "Роль не указана"}</p>
            </div>
          ))}
          {companyContact.loading && <p role="status">Загружаем проекты…</p>}
          {companyContact.error && <p role="alert">{companyContact.error}</p>}
          {!companyContact.loading &&
            !companyContact.error &&
            !otherProjects.length && <p>Другие проекты не указаны.</p>}
        </section>
      </div>
    </aside>
  );
}
