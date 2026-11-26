import type { InitiativeData } from "./workspace";
export const emptyContactFilters = {
  search: "",
  role: "",
  department: "",
  influence: "",
  interaction: "",
  manager: "",
  job: "",
  stance: "",
  decisionMaker: "",
};
export type ContactFilterValues = typeof emptyContactFilters;
export function ContactFilters({
  item,
  value,
  change,
}: {
  item: InitiativeData;
  value: ContactFilterValues;
  change: (value: ContactFilterValues) => void;
}) {
  const set = (key: keyof ContactFilterValues, next: string) =>
    change({ ...value, [key]: next });
  const managers = item.managers?.map((entry) => entry.name) ?? [
    ...new Set(
      item.events
        .map((event) => event.responsibleManager)
        .filter((value): value is string => !!value),
    ),
  ];
  const jobs = [
    ...new Set(
      item.graph.nodes
        .map((person) => person.jobTitle)
        .filter((value): value is string => !!value),
    ),
  ];
  return (
    <div className="smart-filters">
      <div className="filter-grid">
        <label>
          Поиск контакта
          <input
            type="search"
            placeholder="Имя, должность, email"
            value={value.search}
            onChange={(event) => set("search", event.target.value)}
          />
        </label>
        <label>
          Роль в решении
          <select
            value={value.role}
            onChange={(event) => set("role", event.target.value)}
          >
            <option value="">Все роли</option>
            {item.graph.filters.roles.map((role) => (
              <option key={role.code} value={role.code}>
                {role.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Подразделение
          <select
            value={value.department}
            onChange={(event) => set("department", event.target.value)}
          >
            <option value="">Все подразделения</option>
            {item.graph.filters.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="filter-bottom">
        <details>
          <summary>
            Дополнительные фильтры
            {[
              value.influence,
              value.interaction,
              value.manager,
              value.job,
              value.stance,
              value.decisionMaker,
            ].filter(Boolean).length
              ? " · включены"
              : ""}
          </summary>
          <div className="filter-grid extra-filters">
            <label>
              Участие в решении
              <select
                value={value.decisionMaker}
                onChange={(e) => set("decisionMaker", e.target.value)}
              >
                <option value="">Все участники</option>
                <option value="yes">Только ЛПР</option>
                <option value="no">Без ЛПР</option>
              </select>
            </label>
            {item.graph.nodes.some((p) => "stance" in p) && (
              <label>
                Отношение к предложению
                <select
                  value={value.stance}
                  onChange={(e) => set("stance", e.target.value)}
                >
                  <option value="">Любое отношение</option>
                  <option value="SUPPORTS">Поддерживает</option>
                  <option value="NEUTRAL">Нейтральное</option>
                  <option value="DOUBTS">Сомневается</option>
                  <option value="OPPOSES">Возражает</option>
                  <option value="UNKNOWN">Не зафиксировано</option>
                </select>
              </label>
            )}

            <label>
              Влияние
              <select
                value={value.influence}
                onChange={(event) => set("influence", event.target.value)}
              >
                <option value="">Любое влияние</option>
                <option value="HIGH">Высокое</option>
                <option value="MEDIUM">Среднее</option>
                <option value="LOW">Низкое</option>
                <option value="UNKNOWN">Не указано</option>
              </select>
            </label>
            <label>
              Взаимодействия
              <select
                value={value.interaction}
                onChange={(event) => set("interaction", event.target.value)}
              >
                <option value="">Все контакты</option>
                <option value="RECENT">Недавний контакт</option>
                <option value="STALE">Давно не общались</option>
                <option value="UNKNOWN">Нет записей</option>
              </select>
            </label>
            <label>
              Ответственный менеджер
              <select
                value={value.manager}
                onChange={(event) => set("manager", event.target.value)}
              >
                <option value="">Все менеджеры</option>
                {managers.map((manager) => (
                  <option key={manager}>{manager}</option>
                ))}
              </select>
            </label>
            <label>
              Должность
              <select
                value={value.job}
                onChange={(event) => set("job", event.target.value)}
              >
                <option value="">Все должности</option>
                {jobs.map((job) => (
                  <option key={job}>{job}</option>
                ))}
              </select>
            </label>
          </div>
        </details>
        <button
          type="button"
          className="text-button"
          disabled={!Object.values(value).some(Boolean)}
          onClick={() => change(emptyContactFilters)}
        >
          Сбросить фильтры
        </button>
      </div>
    </div>
  );
}
