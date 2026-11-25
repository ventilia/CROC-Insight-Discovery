import { useEffect, useState } from "react";

export type Company = { id: string; name: string };
export type Initiative = { id: string; companyId: string; name: string; asOf: string };
export type Dossier = { person: { role: { label: string } | null } };
export type EventPage = {
  items: { id: string; occurredAt: string; subject: string; outcome: string | null; nextStep: string | null }[];
  nextCursor: string | null;
};

type Remote<T> = { data: T | null; error: string | null; loading: boolean };

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch("/api/v1" + path, init);
  if (!response.ok) {
    if (response.status === 401) throw new Error("Доступ к демо не подтверждён. Проверьте локальную настройку доступа.");
    if (response.status === 404) throw new Error("Запись недоступна.");
    throw new Error("Сервис не ответил. Попробуйте ещё раз.");
  }
  return response.json() as Promise<T>;
}

export function useRemote<T>(path: string | null, attempt = 0): Remote<T> {
  const [result, setResult] = useState<{ path: string; attempt: number; data: T | null; error: string | null }>();
  useEffect(() => {
    if (!path) return;
    const control = new AbortController();
    api<T>(path, { signal: control.signal }).then(
      (data) => {
        if (!control.signal.aborted) setResult({ path, attempt, data, error: null });
      },
      (error: unknown) => {
        if (!control.signal.aborted) setResult({
          path, attempt, data: null, error: error instanceof Error ? error.message : "Не удалось загрузить данные.",
        });
      },
    );
    return () => control.abort();
  }, [path, attempt]);

  if (result && result.path === path && result.attempt === attempt) return { ...result, loading: false };
  return { data: null, error: null, loading: path !== null };
}
