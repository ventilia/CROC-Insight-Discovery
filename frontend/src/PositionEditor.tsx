import { useEffect, useState, type FormEvent } from "react";
import { ApiError, apiWrite, useRemote, type Position, type PositionSource, type Stance } from "./api";
import { formatDate } from "./coverage";

const labels: Record<Stance, string> = {
  SUPPORTS: "Поддерживает",
  NEUTRAL: "Нейтральное отношение",
  DOUBTS: "Сомневается",
  OPPOSES: "Возражает",
};

export function PositionSummary({ position }: { position: Position | null }) {
  return position ? (
    <div className="position-summary">
      <strong>{labels[position.stance]}</strong>
      <p>{position.basis}</p>
      <small>Изменено {formatDate(position.changedAt)} · версия {position.version} · автор: {position.author}</small>
    </div>
  ) : <p>Оценка пока не указана.</p>;
}

export function PositionEditor({ path, onPositionChange }: { path: string; onPositionChange: (position: Position) => void }) {
  const [attempt, retry] = useState(0);
  const remote = useRemote<PositionSource>(path, attempt);
  const [saved, setSaved] = useState<PositionSource | null>(null);
  const [draft, edit] = useState<{ stance: Stance | ""; basis: string }>();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "conflict" | "error">("idle");
  const [compareLatest, setCompareLatest] = useState(false);
  const source = saved ?? remote.data;
  const stance = draft?.stance ?? source?.position?.stance ?? "";
  const basis = draft?.basis ?? source?.position?.basis ?? "";

  useEffect(() => {
    if (remote.data?.position) onPositionChange(remote.data.position);
  }, [onPositionChange, remote.data]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!source?.canEdit || !stance || !basis.trim() || state === "saving" || state === "conflict") return;
    setState("saving");
    try {
      const updated = await apiWrite<PositionSource>(path, "PATCH", {
        stance,
        basis: basis.trim(),
        expectedVersion: source.version,
      });
      setSaved(updated);
      edit(undefined);
      setCompareLatest(false);
      setState("saved");
      if (updated.position) onPositionChange(updated.position);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        edit({ stance, basis });
        setState("conflict");
      } else {
        setState("error");
      }
    }
  }

  return <section className="source-editor" aria-labelledby="source-heading">
    <h3 id="source-heading">Оценка в источнике</h3>
    {remote.loading && !source && <p role="status">Загружаем запись…</p>}
    {remote.error && !source && <p role="alert">{remote.error} <button type="button" className="secondary" onClick={() => retry(attempt + 1)}>Повторить</button></p>}
    {source?.canEdit ? <form onSubmit={submit}>
      {compareLatest && <div className="editor-latest" role="status">
        <strong>Текущая запись</strong>
        <PositionSummary position={source.position} />
        <p>Ваш черновик остался в полях ниже.</p>
      </div>}
      <label>Оценка<select value={stance} required disabled={state === "saving"}
        onChange={(event) => edit({ stance: event.target.value as Stance | "", basis })}>
        <option value="" disabled>Выберите оценку</option>
        {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Основание<textarea value={basis} maxLength={1200} required disabled={state === "saving"}
        onChange={(event) => edit({ stance, basis: event.target.value })} rows={3} /></label>
      {state === "conflict" && <div className="editor-feedback" role="alert">
        <p>Запись уже обновилась. Перечитайте её перед сохранением. Ваш черновик сохранён в форме.</p>
        <button type="button" className="secondary" onClick={() => {
          setSaved(null);
          setCompareLatest(true);
          setState("idle");
          retry(attempt + 1);
        }}>Перечитать версию</button>
      </div>}
      {state === "error" && <p role="alert">Не удалось сохранить запись. Повторите попытку.</p>}
      <button type="submit" className="primary" disabled={!stance || !basis.trim() || state === "saving" || state === "conflict"}>
        {state === "saving" ? "Сохраняем…" : compareLatest ? "Сохранить свой вариант" : "Сохранить оценку"}
      </button>
      {state === "saved" && <p role="status">Оценка сохранена.</p>}
    </form> : source && <p>Доступен просмотр. Для правки подключите деморедактора.</p>}
  </section>;
}
