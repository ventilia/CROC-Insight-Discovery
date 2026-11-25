import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { apiWrite } from "./api";
import { parseCrmCsv, type CrmContact } from "./crm";
import type { WorkspaceData } from "./workspace";

export function CrmImport({
  data,
  initialId,
  close,
  saved,
}: {
  data: WorkspaceData;
  initialId?: string;
  close: () => void;
  saved: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [iid, setIid] = useState(
    initialId ?? data.initiatives[0]?.initiative.id ?? "",
  );
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [reading, setReading] = useState(false);
  const generation = useRef(0);
  const supported = data.capabilities.canImportContacts === true;
  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      generation.current++;
    };
  }, []);
  async function readFile(file: File | undefined) {
    const request = ++generation.current;
    setContacts([]);
    setError("");
    setReading(false);
    if (!file) return;
    if (file.size > 1_000_000) {
      setError("Размер файла — не более 1 МБ.");
      return;
    }
    setReading(true);
    try {
      const text = await file.text();
      if (request === generation.current) setContacts(parseCrmCsv(text));
    } catch (e) {
      if (request === generation.current)
        setError(e instanceof Error ? e.message : "Не удалось прочитать файл.");
    } finally {
      if (request === generation.current) setReading(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="event-dialog crm-import"
      onCancel={(e) => {
        if (pending) e.preventDefault();
        else close();
      }}
    >
      <header>
        <h2>Импорт из CRM</h2>
        <button
          className="icon-button"
          aria-label="Закрыть импорт"
          disabled={pending}
          onClick={close}
        >
          <X size={20} />
        </button>
      </header>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!contacts.length || !iid || pending || reading || !supported)
            return;
          setPending(true);
          setError("");
          try {
            const result = await apiWrite<{
              created: number;
              attached: number;
              skipped: number;
            }>(`/initiatives/${iid}/imports/contacts`, "POST", { contacts });
            saved(
              `Импорт завершён. Создано: ${result.created}, добавлено в проект: ${result.attached}, пропущено дублей: ${result.skipped}.`,
            );
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Не удалось импортировать контакты.",
            );
          } finally {
            setPending(false);
          }
        }}
      >
        <p>
          Загрузите CSV-выгрузку контактов. Прямая синхронизация с CRM пока не
          подключена.
        </p>
        {!supported && (
          <p role="status" className="attention-note">
            Импорт файлов недоступен на подключённом сервере.
          </p>
        )}
        <fieldset disabled={pending || !supported}>
          <label>
            Компания и проект
            <select
              required
              value={iid}
              onChange={(e) => setIid(e.target.value)}
            >
              {data.initiatives.map(({ initiative: i }) => (
                <option key={i.id} value={i.id}>
                  {data.companies.find((c) => c.id === i.companyId)?.name} ·{" "}
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Файл CSV (UTF-8)
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void readFile(e.target.files?.[0])}
            />
          </label>
          <p className="crm-help">
            Колонки: ФИО, Должность, Подразделение, Email, Телефон. Обязательно
            только ФИО. Разделитель — запятая или точка с запятой. До 500
            контактов.
          </p>
          <p className="crm-help">
            Совпадения по email, а без email — по имени, должности и отделу, не
            перезаписывают существующие данные. Роли, влияние и связи
            заполняются отдельно.
          </p>
        </fieldset>
        {reading && <p role="status">Читаем файл…</p>}
        {!!contacts.length && (
          <div className="crm-preview">
            <p>Готово к импорту: {contacts.length}</p>
            <ul>
              {contacts.slice(0, 5).map((p, i) => (
                <li key={i}>
                  <strong>{p.name}</strong>
                  <small>
                    {[p.jobTitle, p.department, p.email]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </li>
              ))}
            </ul>
            {contacts.length > 5 && <small>И ещё {contacts.length - 5}</small>}
          </div>
        )}
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
            className="primary"
            disabled={
              pending || reading || !supported || !iid || !contacts.length
            }
          >
            {pending
              ? "Импортируем…"
              : `Импортировать${contacts.length ? " · " + contacts.length : ""}`}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
