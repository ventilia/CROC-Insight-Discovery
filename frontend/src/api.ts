import { useEffect, useState } from "react";

export type Company = {
  id: string;
  name: string;
  industry?: string | null;
  description?: string | null;
};
export type Initiative = {
  id: string;
  companyId: string;
  name: string;
  asOf: string;
  stage?: string | null;
  owner?: string | null;
  due?: string | null;
  nextStep?: string | null;
  participantCount?: number;
};
export type Stance = "SUPPORTS" | "NEUTRAL" | "DOUBTS" | "OPPOSES";
export type Position = {
  version: number;
  stance: Stance;
  basis: string;
  author: string;
  changedAt: string;
};
export type PositionSource = {
  version: number;
  position: Position | null;
  canEdit: boolean;
};
export type Dossier = {
  person: import("./graph").GraphNode;
  position: Position | null;
};
export type Touchpoint = {
  id: string;
  type: string;
  occurredAt: string;
  subject: string;
  team: string;
  outcome: string | null;
  nextStep: string | null;
  sourceLabel: string | null;
  responsibleManager: string | null;
  author?: string | null;
  initiativeId?: string | null;
  initiativeName?: string | null;
  comment?: string | null;
  participants: { id: string; name: string }[];
};
export type EventPage = { items: Touchpoint[]; nextCursor: string | null };

type Remote<T> = { data: T | null; error: string | null; loading: boolean };

export function useDebounced<T>(value: T, delay = 220) {
  const [current, setCurrent] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setCurrent(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return current;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch("/api/v1" + path, init);
  if (!response.ok) {
    if (response.status === 401)
      throw new ApiError(
        401,
        "Доступ к демо не подтверждён. Проверьте локальную настройку доступа.",
      );
    if (response.status === 403)
      throw new ApiError(403, "Для этого действия нужен доступ.");
    if (response.status === 404) throw new ApiError(404, "Запись недоступна.");
    if ([400, 409, 413].includes(response.status)) {
      const detail = await response
        .clone()
        .json()
        .catch(() => null);
      if (typeof detail?.detail === "string" && detail.detail.length <= 500)
        throw new ApiError(response.status, detail.detail);
    }
    if (response.status === 400)
      throw new ApiError(
        400,
        "Проверьте дату, участников и обязательные поля.",
      );
    if (response.status === 409)
      throw new ApiError(
        409,
        "Запись уже изменилась. Обновите данные перед сохранением.",
      );
    throw new ApiError(
      response.status,
      "Сервис не ответил. Попробуйте ещё раз.",
    );
  }
  return response.json() as Promise<T>;
}

let csrfRequest: Promise<{ headerName: string; token: string }> | undefined;

export async function apiWrite<T>(
  path: string,
  method: "PATCH" | "POST" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  csrfRequest ??= api<{ headerName: string; token: string }>("/csrf").finally(
    () => {
      csrfRequest = undefined;
    },
  );
  const csrf = await csrfRequest;
  return api<T>(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      [csrf.headerName]: csrf.token,
    },
    body: JSON.stringify(body),
  });
}

export function useRemote<T>(path: string | null, attempt = 0): Remote<T> {
  const [result, setResult] = useState<{
    path: string;
    attempt: number;
    data: T | null;
    error: string | null;
  }>();
  useEffect(() => {
    if (!path) return;
    const control = new AbortController();
    api<T>(path, { signal: control.signal }).then(
      (data) => {
        if (!control.signal.aborted)
          setResult({ path, attempt, data, error: null });
      },
      (error: unknown) => {
        if (!control.signal.aborted)
          setResult({
            path,
            attempt,
            data: null,
            error:
              error instanceof Error
                ? error.message
                : "Не удалось загрузить данные.",
          });
      },
    );
    return () => control.abort();
  }, [path, attempt]);

  if (result && result.path === path && result.attempt === attempt)
    return { ...result, loading: false };
  return { data: null, error: null, loading: path !== null };
}
