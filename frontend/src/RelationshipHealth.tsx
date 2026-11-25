import type { Coverage } from "./coverage";
import { relationshipHealth } from "./health";

export function RelationshipHealth({ data }: { data: Coverage }) {
  const health = relationshipHealth(data);
  return <section className="surface relationship-health" aria-labelledby="health-heading">
    <div className="health-score"><span id="health-heading">Индекс отношений</span>
      <div><strong>{health.score ?? "—"}</strong><span>{health.score === null ? "Недостаточно данных" : "из 100"}</span></div>
      <small>По истории общения за {data.days} дней</small>
    </div>
    <div className="health-body">
      <div className="health-factors">
        <div><strong>{health.active} / {health.decisionMakers}</strong><span>ЛПР, с которыми недавно общались</span></div>
        <div><strong>{health.departments} / {health.totalDepartments}</strong><span>Отделов с недавними контактами</span></div>
        <div><strong>{health.verified} / {health.decisionMakers}</strong><span>ЛПР с проверенными данными</span></div>
      </div>
      <details><summary>Как рассчитано и что проверить{health.risks.length ? " · " + health.risks.length : ""}</summary>
        <p>50% оценки — общение с ЛПР, 30% — контакты в отделах, 20% — проверенные данные ЛПР.
          Данные считаются актуальными, если их проверяли за последние {data.verificationDays} дней.</p>
        <p>Расчёт включает всех участников проекта и не зависит от фильтров. Оценка предварительная и зависит от полноты истории.</p>
        {health.risks.length > 0 ? <ul>{health.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul> : <p>Замечаний по этим показателям нет.</p>}
      </details>
      {health.active === 1 && <p className="health-risk">За выбранный период в истории есть контакт только с одним ЛПР.</p>}
    </div>
  </section>;
}
