import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Sparkles, X } from "lucide-react";
import { ApiError, apiWrite, useRemote } from "./api";
import { formatDate } from "./coverage";

type Settings = {
  enabled: boolean;
  model: string | null;
  provider?: string | null;
  canConfigure?: boolean;
  providers?: {
    id: string;
    label: string;
    port: number | null;
    external: boolean;
  }[];
  hasApiKey?: boolean;
  external?: boolean;
};
type Answer = { model: string; answer: string; asOf: string | null };

export function Navigator({
  initiativeId,
  companyId,
  days,
  asOf,
  revision = 0,
}: {
  initiativeId?: string;
  companyId?: string;
  days: number;
  asOf: string | null;
  revision?: number;
}) {
  const [attempt, setAttempt] = useState(0);
  const settings = useRemote<Settings>("/ai/settings", attempt + revision);
  const [question, setQuestion] = useState(
    "С кем стоит связаться в первую очередь?",
  );
  const [answer, setAnswer] = useState<Answer>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const id = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || !settings.data?.enabled || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    setAnswer(undefined);
    try {
      const scope = initiativeId
        ? `/initiatives/${initiativeId}`
        : `/companies/${companyId}`;
      setAnswer(
        await apiWrite<Answer>(scope + "/ai/advice", "POST", {
          days,
          question: question.trim(),
        }),
      );
    } catch (failure) {
      const status = failure instanceof ApiError ? failure.status : 0;
      if (status === 504)
        setError("Модель не успела ответить. Попробуйте снова.");
      else if (status === 429)
        setError("Модель сейчас занята. Попробуйте снова.");
      else
        setError("Модель недоступна. Проверьте подключение в настройках ИИ.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <section className="surface navigator" aria-labelledby={id + "-heading"}>
      <div className="navigator-meta">
        <h2 id={id + "-heading"}>
          <Sparkles size={18} /> ИИ-анализ{" "}
          {initiativeId ? "проекта" : "компании"}
        </h2>
        {settings.data?.enabled && (
          <small>
            {answer?.model ?? settings.data.model} · данные на{" "}
            {formatDate(answer?.asOf ?? asOf)}
          </small>
        )}
      </div>
      {settings.loading && <p role="status">Проверяем настройки модели…</p>}
      {settings.error && (
        <p role="alert">
          {settings.error}{" "}
          <button
            type="button"
            className="secondary"
            onClick={() => setAttempt(attempt + 1)}
          >
            Повторить
          </button>
        </p>
      )}
      {settings.data && !settings.data.enabled && (
        <p>
          Чтобы получить рекомендации, подключите модель в разделе «Настройки
          ИИ».
        </p>
      )}
      {settings.data?.enabled && (
        <form onSubmit={submit}>
          <label htmlFor={id + "-question"}>
            {initiativeId ? "Вопрос по проекту" : "Вопрос по компании"}
          </label>
          {settings.data.external && (
            <p>Вопрос и обезличенные показатели будут переданы провайдеру.</p>
          )}
          <div className="navigator-input">
            <textarea
              id={id + "-question"}
              rows={2}
              maxLength={400}
              required
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              disabled={pending}
            />
            <button
              type="submit"
              className="primary"
              disabled={pending || !question.trim()}
            >
              {pending ? "Модель отвечает…" : "Спросить"}
            </button>
          </div>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {answer && (
        <div className="navigator-answer" role="status">
          <strong>Ответ модели</strong>
          <p>{answer.answer}</p>
        </div>
      )}
    </section>
  );
}

export function LocalModelDialog({
  close,
  saved,
}: {
  close: () => void;
  saved?: () => void;
}) {
  const remote = useRemote<Settings>("/ai/settings");
  const dialog = useRef<HTMLDialogElement>(null);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [allowExternal, setAllowExternal] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Settings>();
  const settings = result ?? remote.data;
  const selected = settings?.providers?.find((entry) => entry.id === provider);
  const storedKey = settings?.hasApiKey && settings.provider === provider;
  const id = useId();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (remote.data) {
      setProvider(remote.data.provider ?? remote.data.providers?.[0]?.id ?? "");
      setModel(remote.data.model ?? "");
    }
  }, [remote.data]);
  async function update(reset = false) {
    if (pending || !settings?.canConfigure) return;
    setPending(true);
    setError("");
    try {
      const connected = await apiWrite<Settings>(
        "/ai/settings",
        reset ? "DELETE" : "PUT",
        reset
          ? undefined
          : {
              provider,
              model: model.trim(),
              apiKey: apiKey.trim() || null,
              allowExternal,
            },
      );
      setResult(connected);
      setApiKey("");
      setModel(connected.model ?? "");
      setProvider(connected.provider ?? connected.providers?.[0]?.id ?? "");
      saved?.();
    } catch (failure) {
      const status = failure instanceof ApiError ? failure.status : null;
      setError(
        status === 502 || status === 504
          ? "Сервер модели недоступен. Проверьте подключение и попробуйте снова."
          : failure instanceof Error
            ? failure.message
            : "Не удалось сохранить настройку.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <dialog
      className="event-dialog local-model-dialog"
      ref={dialog}
      aria-labelledby={id}
      onCancel={(event) => {
        if (pending) event.preventDefault();
        else close();
      }}
    >
      <header>
        <h2 id={id}>Настройки ИИ</h2>
        <button
          className="icon-button"
          type="button"
          aria-label="Закрыть настройки"
          disabled={pending}
          onClick={close}
        >
          <X size={20} />
        </button>
      </header>
      {remote.loading ? (
        <p className="empty-inline" role="status">
          Проверяем настройки…
        </p>
      ) : remote.error ? (
        <p className="empty-inline" role="alert">
          {remote.error}
        </p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void update();
          }}
        >
          <fieldset disabled={pending || !settings?.canConfigure}>
            <label>
              Провайдер
              <select
                value={provider}
                onChange={(event) => {
                  setProvider(event.target.value);
                  setApiKey("");
                  setModel("");
                  setAllowExternal(false);
                }}
              >
                {settings?.providers?.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                    {entry.port ? ` · порт ${entry.port}` : " · API"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Имя модели
              <input
                required
                maxLength={120}
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder={
                  provider === "OPENROUTER"
                    ? "openrouter/free"
                    : provider === "OPENAI"
                      ? "gpt-4o-mini"
                      : "qwen2.5:7b"
                }
              />
            </label>
            <label>
              {selected?.external
                ? "Ключ API"
                : "Ключ API, если сервер его требует"}
              <input
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                required={selected?.external && !storedKey}
                maxLength={500}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={storedKey ? "Ключ уже сохранён" : undefined}
              />
            </label>
            {selected?.external ? (
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={allowExternal}
                  onChange={(event) => setAllowExternal(event.target.checked)}
                  required
                />
                Разрешаю передавать выбранному провайдеру вопрос и обезличенные
                показатели. Подключение выполняет короткий пробный запрос.
              </label>
            ) : (
              <p>
                Локальная модель должна работать на том же компьютере, что и
                Spring Boot.
              </p>
            )}
          </fieldset>
          {settings?.enabled && (
            <p role="status">Подключена модель {settings.model}.</p>
          )}
          {!settings?.canConfigure && (
            <p>Настройки модели доступны редактору.</p>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="actions">
            {settings?.enabled && settings.canConfigure && (
              <button
                className="secondary"
                type="button"
                disabled={pending}
                onClick={() => void update(true)}
              >
                Сбросить настройку
              </button>
            )}
            <button
              className="primary"
              type="submit"
              disabled={
                pending || !settings?.canConfigure || !model.trim() || !provider
              }
            >
              {pending ? "Проверяем…" : "Подключить"}
            </button>
          </div>
          <p>
            Настройка и ключ действуют для вашей учётной записи до перезапуска
            бэкенда.
          </p>
        </form>
      )}
    </dialog>
  );
}
