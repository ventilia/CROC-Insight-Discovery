import type { Coverage } from "./coverage";
import { relationshipHealth } from "./health";

export function RelationshipHealth({ data }: { data: Coverage }) {
  const health = relationshipHealth(data);
  return <section className="surface relationship-health" aria-labelledby="health-heading">
    <div className="health-score"><span id="health-heading">Индекс устойчивости отношений</span>
      <div><strong>{health.score ?? "—"}</strong><span>{health.score === null ? "Недостаточно данных" : "из 100"}</span></div>
      <small>По данным выбранной инициативы за {data.days} дней</small>
    </div>
    <div className="health-body">
      <div className="health-factors">
        <div><strong>{health.active} / {health.decisionMakers}</strong><span>ЛПР с недавним касанием</span></div>
        <div><strong>{health.departments} / {health.totalDepartments}</strong><span>Подразделений охвачено</span></div>
        <div><strong>{health.verified} / {health.decisionMakers}</strong><span>ЛПР с проверенными данными</span></div>
      </div>
      <details><summary>Расчёт и зоны внимания{health.risks.length ? " · " + health.risks.length : ""}</summary>
        <p>Пилотная формула: 50% — доля ЛПР с недавним касанием, 30% — доля охваченных подразделений,
          20% — доля ЛПР с данными, проверенными за {data.verificationDays} дней. Считается по всей инициативе, до фильтрации.</p>
        <p>Индекс описывает охват по зафиксированным данным. Для расчёта нужны известные ЛПР и подразделения.</p>
        {health.risks.length > 0 ? <ul>{health.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul> : <p>По этим показателям зон внимания нет.</p>}
      </details>
      {health.active === 1 && <p className="health-risk">В доступной истории недавний контакт есть только с одним ЛПР.</p>}
    </div>
  </section>;
}
