import { useEffect, useRef, useState, type FormEvent } from "react";
import { X, Check } from "lucide-react";
import { apiWrite, useRemote } from "./api";
import type { Graph } from "./graph";
import type { InitiativeData } from "./workspace";
import { eventLabels } from "./History";

function localNow() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function EventForm({
  items,
  initialInitiative,
  initialPerson,
  close,
  saved,
  server = false,
}: {
  items: InitiativeData[];
  initialInitiative: string;
  initialPerson?: string;
  close: () => void;
  saved: () => void;
  server?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    submitting = useRef(false);
  const [initiative, setInitiative] = useState(
    initialInitiative || items[0]?.initiative.id || "",
  );
  const [selected, setSelected] = useState<string[]>(
    initialPerson ? [initialPerson] : [],
  );
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [id] = useState(() => crypto.randomUUID());
  const current = items.find((item) => item.initiative.id === initiative);
  const roster = useRemote<Graph>(
    server && initiative && !current?.graph.nodes.length
      ? `/initiatives/${initiative}/graph`
      : null,
  );
  const participants = roster.data?.nodes ?? current?.graph.nodes ?? [];
  useEffect(() => {
    const opener = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !current) return;
    if (!selected.length) {
      setError("Выберите хотя бы одного участника.");
      return;
    }
    const form = new FormData(event.currentTarget),
      occurredAt = new Date(String(form.get("occurredAt")));
    if (
      !Number.isFinite(occurredAt.getTime()) ||
      occurredAt.getTime() > Date.now()
    ) {
      setError("Укажите прошедшую дату взаимодействия.");
      return;
    }
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      await apiWrite(`/initiatives/${initiative}/events`, "POST", {
        id,
        type: form.get("type"),
        subject: String(form.get("subject")).trim(),
        occurredAt: occurredAt.toISOString(),
        team: form.get("team"),
        responsibleManager: String(form.get("manager")).trim(),
        outcome: String(form.get("outcome")).trim() || null,
        comment: String(form.get("comment")).trim() || null,
        nextStep: String(form.get("nextStep")).trim() || null,
        participantIds: selected,
      });
      saved();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось сохранить. Повторите попытку.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="event-dialog"
      aria-labelledby="event-form-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) close();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">История работы с клиентом</span>
          <h2 id="event-form-title">Добавить запись</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Закрыть форму"
          disabled={pending}
          onClick={close}
        >
          <X size={21} />
        </button>
      </header>
      <form onSubmit={submit}>
        <fieldset disabled={pending}>
          <label>
            Проект
            <select
              value={initiative}
              onChange={(event) => {
                setInitiative(event.target.value);
                setSelected([]);
              }}
            >
              {items.map((item) => (
                <option key={item.initiative.id} value={item.initiative.id}>
                  {item.initiative.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-row">
            <label>
              Тип записи
              <select name="type" defaultValue="MEETING">
                {Object.entries(eventLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Дата и время
              <input
                name="occurredAt"
                type="datetime-local"
                required
                defaultValue={localNow()}
                max={localNow()}
              />
            </label>
          </div>
          <label>
            Тема
            <input
              autoFocus
              name="subject"
              required
              maxLength={300}
              placeholder="Например, обсуждение бюджета пилота"
            />
          </label>
          <div className="participant-picker">
            <span>
              Участники <small>выберите хотя бы одного</small>
            </span>
            <div>
              {roster.loading && <p role="status">Загружаем участников…</p>}
              {roster.error && (
                <p className="form-error" role="alert">
                  {roster.error}
                </p>
              )}
              {participants.map((person) => (
                <label key={person.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(person.id)}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, person.id]
                          : selected.filter((id) => id !== person.id),
                      )
                    }
                  />

                  <span>{person.name}</span>
                  {selected.includes(person.id) && <Check size={15} />}
                </label>
              ))}
            </div>
          </div>
          <div className="form-row">
            <label>
              Команда КРОК
              <select name="team">
                <option>Продажи</option>
                <option>Маркетинг</option>
                <option>Проектная команда</option>
                <option>Производственная команда</option>
                <option>Руководство</option>
              </select>
            </label>
            <label>
              Ответственный менеджер
              <input
                name="manager"
                required
                maxLength={160}
                placeholder="Имя и фамилия"
              />
            </label>
          </div>
          <label>
            Результат
            <textarea
              name="outcome"
              rows={3}
              maxLength={2000}
              placeholder="Что обсудили и о чём договорились"
            />
          </label>
          <label>
            Комментарий
            <textarea name="comment" rows={2} maxLength={2000} />
          </label>
          <label>
            Следующий шаг
            <textarea
              name="nextStep"
              rows={2}
              maxLength={2000}
              placeholder="Что нужно сделать дальше"
            />
          </label>
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
            disabled={pending}
            onClick={close}
          >
            Отмена
          </button>
          <button
            type="submit"
            className="primary"
            disabled={pending || !participants.length}
          >
            {pending ? "Сохраняем…" : "Сохранить запись"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
