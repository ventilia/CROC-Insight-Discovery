import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, ClipboardList, Copy, GitBranch, ScanSearch, Sparkles, X } from "lucide-react";
import { ApiError, apiWrite, useRemote } from "./api";

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
export type NavigatorSource = {
  ref: string;
  label: string;
  kind: "CONTACT" | "PROJECT";
  id: string;
  initiativeId: string | null;
};
type Answer = { model: string; answer: string; sources?: NavigatorSource[] };
type Mode = "QUESTION" | "MEETING_BRIEF" | "TEST_HYPOTHESIS" | "CONTACT_FALLBACK";

const scenarios = [
  { id: "QUESTION", label: "Следующий шаг", note: "Что сделать первым", question: "Какой следующий шаг даст больше всего пользы и почему?", icon: Sparkles },
  { id: "MEETING_BRIEF", label: "Бриф встречи", note: "Кого позвать и что спросить", question: "Подготовь бриф для ближайшей встречи на основе среза.", icon: ClipboardList },
  { id: "TEST_HYPOTHESIS", label: "Проверить гипотезу", note: "Факты, версии и вопрос для проверки", question: "Какую гипотезу о затруднении в коммуникации стоит проверить первой?", icon: ScanSearch },
  { id: "CONTACT_FALLBACK", label: "Если выпадет ЛПР", note: "Зависимость и запасная точка входа", question: "Что изменится, если самый задействованный ЛПР временно недоступен?", icon: GitBranch },
] as const;

export function Navigator({
  initiativeId,
  companyId,
  days,
  revision = 0,
  onSource,
}: {
  initiativeId?: string;
  companyId?: string;
  days: number;
  revision?: number;
  onSource: (source: NavigatorSource) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const settings = useRemote<Settings>("/ai/settings", attempt + revision);
  const [mode, setMode] = useState<Mode>("QUESTION");
  const [question, setQuestion] = useState<string>(scenarios[0].question);
  const [answer, setAnswer] = useState<Answer>();
  const [copyStatus, setCopyStatus] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [allowExternal, setAllowExternal] = useState(false);
  const inFlight = useRef(false);
  const id = useId();
  useEffect(() => setCopyStatus(""), [answer]);

  async function copyAnswer(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Текст скопирован.");
    } catch {
      setCopyStatus("Скопируйте текст вручную.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || !settings.data?.enabled || inFlight.current) return;
    if (settings.data.external && !allowExternal) return;
    inFlight.current = true;
    setPending(true);
    setAllowExternal(false);
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
          mode,
          allowExternal,
        }),
      );
    } catch (failure) {
      const status = failure instanceof ApiError ? failure.status : 0;
      if (status === 504)
        setError("Модель не успела ответить. Попробуйте снова.");
      else if (status === 429)
        setError("Модель сейчас занята. Попробуйте снова.");
      else if (status === 400)
        setError("Проверьте вопрос и подтверждение отправки внешнему провайдеру.");
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
            {answer?.model ?? settings.data.model}
          </small>
        )}
      </div>
      <p>Подготовьте разговор, проверьте гипотезу или найдите запасную точку входа по данным KIT.</p>
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
          <div className="navigator-prompts" role="group" aria-label="Сценарии анализа">
            {scenarios.map((preset) => (
              <button
                key={preset.id}
                className="secondary"
                type="button"
                aria-pressed={mode === preset.id}
                disabled={pending}
                onClick={() => {
                  setMode(preset.id);
                  setQuestion(preset.question);
                  setAllowExternal(false);
                  setAnswer(undefined);
                  setError("");
                }}
              >
                <preset.icon size={18} aria-hidden="true" />
                <span><strong>{preset.label}</strong><small>{preset.note}</small></span>
              </button>
            ))}
          </div>
          <label htmlFor={id + "-question"}>
            {initiativeId ? "Вопрос по проекту" : "Вопрос по компании"}
          </label>
          <div className="navigator-input">
            <textarea
              id={id + "-question"}
              rows={2}
              maxLength={400}
              required
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value);
                setAllowExternal(false);
                setAnswer(undefined);
                setError("");
              }}
              disabled={pending}
            />
            <button
              type="submit"
              className="primary"
              disabled={pending || !question.trim() || (settings.data.external && !allowExternal)}
            >
              {pending ? "Модель отвечает…" : "Разобрать"}
            </button>
          </div>
          {settings.data.external && (
            <label className="navigator-consent">
              <input
                type="checkbox"
                checked={allowExternal}
                onChange={(event) => setAllowExternal(event.target.checked)}
                disabled={pending}
              />
              Разрешаю отправить этот вопрос и обезличенные показатели внешнему провайдеру. Не включаю в вопрос имена и конфиденциальные сведения.
            </label>
          )}
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {answer && (
        <div className="navigator-answer" role="status">
          <div className="navigator-meta">
            <strong>Ответ модели</strong>
            <button type="button" className="secondary" onClick={() => void copyAnswer(answer.answer)}>
              <Copy size={14} aria-hidden="true" /> Копировать ответ
            </button>
          </div>
          {copyStatus && <small>{copyStatus}</small>}
          <p>{answer.answer}</p>
          {!!answer.sources?.length && (
            <div className="navigator-sources" aria-label="Карточки упомянутых контактов и проектов">
              {answer.sources.map((source) => (
                <button key={source.ref} className="secondary" type="button" onClick={() => onSource(source)}>
                  {source.label} <ArrowUpRight size={14} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
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
                      : provider === "GEMINI"
                        ? "gemini-3.5-flash-lite"
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
