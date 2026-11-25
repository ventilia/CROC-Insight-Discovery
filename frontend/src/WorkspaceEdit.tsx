import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { apiWrite } from "./api";
import type { InitiativeData } from "./workspace";
export type WorkspaceAction = {
  kind: "person" | "edit" | "project" | "relationship" | "request";
  iid?: string;
  pid?: string;
  cid?: string;
};
const titles = {
  person: "Новый участник",
  edit: "Уточнить карточку",
  project: "Новый проект",
  relationship: "Новая связь",
  request: "Запрос информации",
};
export function WorkspaceEdit({
  action,
  item,
  close,
  saved,
}: {
  action: WorkspaceAction;
  item?: InitiativeData;
  close: () => void;
  saved: (id: string) => void;
}) {
  const person = item?.graph.nodes.find((p) => p.id === action.pid);
  const [draft, setDraft] = useState<Record<string, string>>(() => ({
    name: person?.name ?? "",
    jobTitle: person?.jobTitle ?? "",
    department: person?.department?.name ?? "",
    email: person?.email ?? "",
    phone: person?.phone ?? "",
    roleLabel: person?.role?.label ?? "",
    influence: person?.influence ?? "",
    influenceBasis: person?.influenceBasis ?? "",
    decisionMaker: String(person?.decisionMaker ?? false),
    mandate: person?.mandate ?? "",
    interest: person?.interest ?? "",
    sourceLabel: person?.sourceLabel ?? "",
    owner: item?.initiative.owner ?? "",
    recipient: item?.initiative.owner ?? "",
    personId: action.pid ?? "",
    source: action.pid ?? "",
    target: "",
    type: "COORDINATION",
    confirmed: "false",
  }));
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const change = (key: string, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const field = (
    key: string,
    label: string,
    max = 200,
    required = false,
    type = "text",
  ) => (
    <label key={key}>
      {label}
      <input
        name={key}
        type={type}
        value={draft[key] ?? ""}
        onChange={(e) => change(key, e.target.value)}
        maxLength={max}
        required={required}
      />
    </label>
  );
  const area = (key: string, label: string, max = 500, required = false) => (
    <label key={key}>
      {label}
      <textarea
        name={key}
        value={draft[key] ?? ""}
        onChange={(e) => change(key, e.target.value)}
        maxLength={max}
        required={required}
        rows={3}
      />
    </label>
  );
  const picker = (key: string, label: string, allowEmpty = true) => (
    <label>
      {label}
      <select
        value={draft[key] ?? ""}
        required={!allowEmpty}
        onChange={(e) => change(key, e.target.value)}
      >
        <option value="">
          {allowEmpty ? "Весь проект" : "Выберите участника"}
        </option>
        {item?.graph.nodes.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.department?.name ?? "Отдел не указан"}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <dialog
      className="event-dialog workspace-edit"
      ref={dialog}
      onCancel={(e) => {
        if (pending) e.preventDefault();
        else close();
      }}
    >
      <header>
        <div>
          <h2>{titles[action.kind]}</h2>
          {item && <p className="edit-context">{item.initiative.name}</p>}
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Закрыть форму"
          disabled={pending}
          onClick={close}
        >
          <X size={20} />
        </button>
      </header>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending) return;
          setPending(true);
          setError("");
          const iid = item?.initiative.id;
          let path = "",
            method: "POST" | "PATCH" = "POST",
            body: Record<string, unknown> = { ...draft };
          if (action.kind === "project")
            path = `/companies/${action.cid}/initiatives`;
          else if (action.kind === "request")
            path = `/initiatives/${iid}/requests`;
          else if (action.kind === "relationship") {
            path = `/initiatives/${iid}/relationships`;
            body.confirmed = draft.confirmed === "true";
          } else {
            path = `/initiatives/${iid}/people${action.kind === "edit" ? "/" + action.pid : ""}`;
            method = action.kind === "edit" ? "PATCH" : "POST";
            body.decisionMaker = draft.decisionMaker === "true";
            body.expectedVersion = person?.editVersion ?? 0;
            body.influence =
              draft.influence === "UNKNOWN" ? "" : draft.influence;
          }
          try {
            const result = await apiWrite<{ id: string }>(path, method, body);
            saved(result.id);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось сохранить.");
          } finally {
            setPending(false);
          }
        }}
      >
        <fieldset disabled={pending}>
          {action.kind === "project" ? (
            <>
              {field("name", "Название проекта", 200, true)}
              <div className="form-row">
                {field("stage", "Стадия", 100)}
                {field("owner", "Ответственный", 200, true)}
              </div>
              {field("due", "Срок", 32, false, "date")}
              {area("nextStep", "Следующий шаг")}
            </>
          ) : action.kind === "request" ? (
            <>
              {picker("personId", "К кому относится запрос")}
              {field("recipient", "Кому адресован", 200, true)}
              {area("question", "Что требуется уточнить", 1000, true)}
              <p className="edit-context">
                Запрос сохранится как черновик. Сообщение адресату не
                отправляется.
              </p>
            </>
          ) : action.kind === "relationship" ? (
            <>
              <div className="form-row">
                {picker("source", "От кого", false)}
                {picker("target", "К кому", false)}
              </div>
              <label>
                Тип связи
                <select
                  value={draft.type}
                  onChange={(e) => change("type", e.target.value)}
                >
                  <option value="APPROVAL">Согласование</option>
                  <option value="COORDINATION">Координация</option>
                  <option value="EXPERTISE">Экспертиза</option>
                </select>
              </label>
              {field("label", "В чём проявляется связь", 300, true)}
              {area(
                "sourceLabel",
                "Основание связи",
                500,
                draft.confirmed === "true",
              )}
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={draft.confirmed === "true"}
                  onChange={(e) =>
                    change("confirmed", String(e.target.checked))
                  }
                />
                Связь подтверждена
              </label>
            </>
          ) : (
            <>
              {field("name", "Имя и фамилия", 200, true)}
              <div className="form-row">
                {field("jobTitle", "Должность", 300)}
                {field("department", "Подразделение", 160)}
              </div>
              <div className="form-row">
                {field("email", "Рабочая почта", 254, false, "email")}
                {field("phone", "Рабочий телефон", 60, false, "tel")}
              </div>
              {action.kind === "edit" && (
                <p className="edit-context">
                  Имя и контактные данные общие для проектов компании. Роль и
                  оценка влияния относятся к выбранному проекту.
                </p>
              )}
              <label>
                Роль в проекте
                <input
                  list="participant-roles"
                  value={draft.roleLabel}
                  onChange={(e) => change("roleLabel", e.target.value)}
                  maxLength={120}
                />
                <datalist id="participant-roles">
                  {item?.graph.filters.roles.map((r) => (
                    <option key={r.code} value={r.label} />
                  ))}
                </datalist>
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={draft.decisionMaker === "true"}
                  onChange={(e) =>
                    change("decisionMaker", String(e.target.checked))
                  }
                />
                Принимает решения (ЛПР)
              </label>
              {field("mandate", "Область принятия решений", 200)}
              <label>
                Влияние
                <select
                  value={draft.influence === "UNKNOWN" ? "" : draft.influence}
                  onChange={(e) => change("influence", e.target.value)}
                >
                  <option value="">Не оценено</option>
                  <option value="HIGH">Высокое</option>
                  <option value="MEDIUM">Среднее</option>
                  <option value="LOW">Низкое</option>
                </select>
              </label>
              {area(
                "influenceBasis",
                "Основание оценки влияния",
                500,
                !!draft.influence && draft.influence !== "UNKNOWN",
              )}
              {area("interest", "Что важно участнику")}
              {field("sourceLabel", "Источник сведений", 300)}
            </>
          )}
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button
            type="button"
            className="secondary"
            onClick={close}
            disabled={pending}
          >
            Отмена
          </button>
          <button className="primary" disabled={pending}>
            {pending ? "Сохраняем…" : "Сохранить"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
