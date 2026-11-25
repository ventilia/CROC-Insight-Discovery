import { useEffect, useRef, useState } from "react";
import { X, Mail, Phone, Link2, Plus, Copy } from "lucide-react";
import { useRemote, type Dossier, type Position } from "./api";
import { PositionEditor, PositionSummary } from "./PositionEditor";
import { HistoryList } from "./History";
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
}: {
  item: InitiativeData;
  personId: string;
  onPerson: (iid: string, pid: string) => void;
  close: () => void;
  onEvent: () => void;
  canEdit: boolean;
}) {
  const [attempt, retry] = useState(0),
    [editing, setEditing] = useState(false),
    [position, setPosition] = useState<Position | null>(null),
    [copied, setCopied] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const person = item.graph.nodes.find((person) => person.id === personId)!;
  const coverage = item.coverage.contacts.find((p) => p.id === personId);
  const path = `/initiatives/${item.initiative.id}/people/${personId}`;
  const dossier = useRemote<Dossier>(path, attempt);
  const linked = item.graph.edges.filter(
    (edge) => edge.source === personId || edge.target === personId,
  );
  const events = history([item]).filter((event) =>
    event.participants.some((p) => p.id === personId),
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
      className="contact-drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby="contact-drawer-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
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
      <div className="drawer-scroll">
        <div className="profile-hero">
          <span className={"avatar large tone-" + roleTone(person.role?.code)}>
            {person.name
              .split(" ")
              .slice(0, 2)
              .map((part) => part[0])
              .join("")}
          </span>
          <h2 id="contact-drawer-title" ref={heading} tabIndex={-1}>
            {person.name}
          </h2>
          <p>{person.jobTitle ?? "Должность не указана"}</p>
          <span>{person.department?.name ?? "Подразделение не указано"}</span>
          <div className="profile-badges">
            <span className={"role-badge tone-" + roleTone(person.role?.code)}>
              {person.role?.label ?? "Роль не указана"}
            </span>
            {person.decisionMaker && <span className="pill">ЛПР</span>}
          </div>
        </div>
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
          <button type="button" className="text-button" onClick={copy}>
            <Copy size={14} />
            Скопировать контакт
          </button>
          <span className="copy-result" role="status">
            {copied}
          </span>
        </section>
        <section className="profile-section">
          <h3>Влияние на решение</h3>
          <strong>{influenceLabels[person.influence ?? "UNKNOWN"]}</strong>
          <p>
            {person.influenceBasis ?? "Обоснование оценки не указано."}
          </p>
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
            />
          )}
        </section>
        <section className="profile-section">
          <h3>
            <Link2 size={17} />
            Связанные сотрудники <span>{linked.length}</span>
          </h3>
          {linked.length ? (
            <div className="linked-people">
              {linked.map((edge) => {
                const other = item.graph.nodes.find(
                  (p) =>
                    p.id ===
                    (edge.source === personId ? edge.target : edge.source),
                );
                return (
                  other && (
                    <button
                      type="button"
                      key={edge.id}
                      onClick={() => onPerson(item.initiative.id, other.id)}
                    >
                      <strong>{other.name}</strong>
                      <span>
                        {edge.source === personId ? "Исходящая" : "Входящая"}{" "}
                        связь ·{" "}
                        {edge.confirmed ? "Подтверждена" : "Требует проверки"}
                      </span>
                      <p>{edge.label}</p>
                    </button>
                  )
                );
              })}
            </div>
          ) : (
            <p>Связи не указаны.</p>
          )}
        </section>
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
          <HistoryList entries={events} onPerson={onPerson} />
        </section>
      </div>
    </aside>
  );
}
