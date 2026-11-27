import { useState } from "react";
import { Building2, ChevronRight, Map, ShieldCheck, UserRound } from "lucide-react";
import type { CompanyInsights, LostConnection } from "./companyApi";
import { formatDate } from "./coverage";
import "./lost-connections.css";

const categories = [
  { id: "CONTACT", label: "Люди", icon: UserRound },
  { id: "DEPARTMENT", label: "Подразделения", icon: Building2 },
  { id: "VERIFICATION", label: "Проверка данных", icon: ShieldCheck },
] as const;
const pageSize = 8;
const statusLabels = {
  CONTACT: { STALE: "Последняя связь вне периода", NO_EVIDENCE: "Нет записи об общении" },
  DEPARTMENT: { STALE: "Последняя связь вне периода", NO_EVIDENCE: "Нет записи об общении" },
  VERIFICATION: { STALE: "Проверка просрочена", NO_EVIDENCE: "Нет записи о проверке" },
};

type Props = {
  facts?: CompanyInsights;
  loading?: boolean;
  initiativeId?: string;
  onProject: (initiativeId: string) => void;
  onMap: (initiativeId: string, departmentId?: string) => void;
  onContact: (contactId: string, initiativeId: string) => void;
};

export default function LostConnections({ facts, loading, initiativeId, onProject, onMap, onContact }: Props) {
  const [category, setCategory] = useState<LostConnection["category"]>("CONTACT");
  const [limit, setLimit] = useState(pageSize);
  const signals = (facts?.lostConnections ?? []).filter((signal) => !initiativeId || signal.initiativeId === initiativeId);
  const visible = signals.filter((signal) => signal.category === category);

  return (
    <section className="surface lost-connections" aria-label="Сигналы потерянных связей">
      <div className="section-heading">
        <div>
          {facts?.latestAsOf && <p>Связь за {facts.days} дн. и проверка данных за {facts.verificationDays} дн. на дату среза проекта</p>}
        </div>
      </div>
      {!facts?.lostConnections ? (
        <p className="empty-inline" role="status">{loading ? "Загружаем сигналы…" : "Данные о потерянных связях недоступны."}</p>
      ) : !facts.latestAsOf ? (
        <p className="empty-inline">Проверка появится после добавления проектов.</p>
      ) : (
        <>
          <div className="lost-connections-filters" role="group" aria-label="Тип сигнала">
            {categories.map(({ id, label, icon: Icon }) => (
              <button className="secondary" type="button" key={id} aria-pressed={category === id} onClick={() => {
                setCategory(id);
                setLimit(pageSize);
              }}>
                <Icon size={16} aria-hidden="true" />
                {label}
                <span>{signals.filter((signal) => signal.category === id).length}</span>
              </button>
            ))}
          </div>
          {visible.length ? (
            <ul className="lost-connections-list" aria-label="Сигналы">
              {visible.slice(0, limit).map((signal) => (
                <li key={`${signal.initiativeId}/${signal.category}/${signal.subjectId}`}>
                  <div className="lost-connections-subject">
                    <strong>{signal.subjectName}{signal.decisionMaker && <small>ЛПР</small>}</strong>
                    <button className="text-button" type="button" onClick={() => onProject(signal.initiativeId)}>{signal.initiativeName}</button>
                  </div>
                  <div className="lost-connections-evidence">
                    <strong>{statusLabels[signal.category][signal.evidenceStatus]}</strong>
                    {category === "VERIFICATION" && signal.lastVerifiedAt && <span>Проверка · {formatDate(signal.lastVerifiedAt)}</span>}
                    <span>{signal.lastInteractionAt ? `Последний контакт · ${formatDate(signal.lastInteractionAt)}` : "Последний контакт неизвестен"}</span>
                  </div>
                  {category === "DEPARTMENT" ? (
                    <button className="secondary" type="button" onClick={() => onMap(signal.initiativeId, signal.subjectId)}><Map size={16} aria-hidden="true" /> На карте</button>
                  ) : (
                    <button className="secondary" type="button" onClick={() => onContact(signal.subjectId, signal.initiativeId)}>К контакту <ChevronRight size={16} aria-hidden="true" /></button>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="empty-inline">Сигналов этой категории по текущим данным нет.</p>}
          {visible.length > limit && <button className="secondary" type="button" onClick={() => setLimit((value) => value + pageSize)}>Показать ещё</button>}
        </>
      )}
    </section>
  );
}
