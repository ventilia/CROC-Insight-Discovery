import { useRef, useState, type FormEvent } from "react";
import { Sparkles } from "lucide-react";
import { ApiError, apiWrite, useRemote } from "./api";
import { formatDate } from "./coverage";

type Settings = { enabled: boolean; model: string | null };
type Answer = { model: string; answer: string; asOf: string };

export function Navigator({ initiativeId, days, asOf }: { initiativeId: string; days: number; asOf: string }) {
  const [attempt, setAttempt] = useState(0);
  const settings = useRemote<Settings>("/ai/settings", attempt);
  const [question, setQuestion] = useState("С кем стоит связаться в первую очередь?");
  const [answer, setAnswer] = useState<Answer>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || !settings.data?.enabled || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    setAnswer(undefined);
    try {
      setAnswer(await apiWrite<Answer>("/initiatives/" + initiativeId + "/ai/advice", "POST", { days, question: question.trim() }));
    } catch (failure) {
      const status = failure instanceof ApiError ? failure.status : 0;
      if (status === 504) setError("Модель не успела ответить. Попробуйте снова.");
      else if (status === 429) setError("Модель сейчас занята. Попробуйте снова.");
      else setError("Локальная модель недоступна. Проверьте, что её сервер запущен.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return <section className="surface navigator" aria-labelledby="navigator-heading">
    <div className="navigator-meta">
      <h2 id="navigator-heading"><Sparkles size={18} /> Навигатор</h2>
      {settings.data?.enabled && <small>{answer?.model ?? settings.data.model} · данные на {formatDate(answer?.asOf ?? asOf)}</small>}
    </div>
    {settings.loading && <p role="status">Проверяем настройки модели…</p>}
    {settings.error && <p role="alert">{settings.error} <button type="button" className="secondary" onClick={() => setAttempt(attempt + 1)}>Повторить</button></p>}
    {settings.data && !settings.data.enabled && <p>AI-помощник не подключён. Выше доступны рекомендации по данным.</p>}
    {settings.data?.enabled && <form onSubmit={submit}>
      <label htmlFor="navigator-question">Вопрос по проекту</label>
      <div className="navigator-input">
        <textarea id="navigator-question" rows={2} maxLength={400} required value={question}
          onChange={(event) => setQuestion(event.target.value)} disabled={pending} />
        <button type="submit" className="primary" disabled={pending || !question.trim()}>
          {pending ? "Модель отвечает…" : "Спросить"}
        </button>
      </div>
    </form>}
    {error && <p role="alert">{error}</p>}
    {answer && <div className="navigator-answer" role="status">
      <strong>Ответ помощника</strong><p>{answer.answer}</p>
    </div>}
  </section>;
}
