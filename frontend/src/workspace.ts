import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  type Company,
  type Initiative,
  type Touchpoint,
  type EventPage,
} from "./api.ts";
import type { Graph, GraphNode } from "./graph";
import type { Coverage } from "./coverage";
import { relationshipHealth } from "./health.ts";

export type InitiativeData = {
  initiative: Initiative;
  graph: Graph;
  coverage: Coverage;
  events: Touchpoint[];
};
export type WorkspaceData = {
  companies: Company[];
  initiatives: InitiativeData[];
  capabilities: { mode: string; canCreateEvents: boolean; canImportContacts?: boolean };
};
export type HistoryEntry = Touchpoint & {
  initiativeId: string;
  initiativeName: string;
};

async function readHistory(id: string, signal: AbortSignal) {
  const items: Touchpoint[] = [],
    seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: "50" });
    if (cursor) params.set("cursor", cursor);
    const page = await api<EventPage>(`/initiatives/${id}/events?${params}`, {
      signal,
    });
    items.push(...page.items);
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor))
      throw new Error(
        "История вернула повторяющуюся страницу. Повторите загрузку.",
      );
    if (cursor) seen.add(cursor);
  } while (cursor);
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

export async function loadWorkspace(
  days: number,
  signal: AbortSignal,
): Promise<WorkspaceData> {
  const [companies, capabilities] = await Promise.all([
    api<Company[]>("/companies", { signal }),
    api<WorkspaceData["capabilities"]>("/capabilities", { signal }).catch(
      (error) => {
        if (error instanceof ApiError && error.status === 404)
          return { mode: "api", canCreateEvents: false };
        throw error;
      },
    ),
  ]);
  const initiatives: InitiativeData[] = [];
  // Bound the fan-out for corporate portfolios; histories keep the server cursor order.
  for (let offset = 0; offset < companies.length; offset += 4) {
    const batch = await Promise.all(
      companies
        .slice(offset, offset + 4)
        .map((company) =>
          api<Initiative[]>(`/companies/${company.id}/initiatives`, { signal }),
        ),
    );
    for (const initiative of batch.flat()) {
      const [graph, coverage, events] = await Promise.all([
        api<Graph>(`/initiatives/${initiative.id}/graph`, { signal }),
        api<Coverage>(`/initiatives/${initiative.id}/coverage?days=${days}`, {
          signal,
        }),
        readHistory(initiative.id, signal),
      ]);
      initiatives.push({ initiative, graph, coverage, events });
    }
  }
  return { companies, capabilities, initiatives };
}

export function useWorkspace(days: number) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    data: WorkspaceData | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });
  useEffect(() => {
    const controller = new AbortController();
    setState((old) => ({ ...old, loading: true, error: null }));
    loadWorkspace(days, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted)
          setState({ data, loading: false, error: null });
      },
      (error) => {
        if (!controller.signal.aborted)
          setState((old) => ({
            ...old,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Не удалось загрузить данные.",
          }));
      },
    );
    return () => controller.abort();
  }, [days, revision]);
  return { ...state, refresh: () => setRevision((value) => value + 1) };
}

export function companyData(data: WorkspaceData, id: string) {
  return data.initiatives.filter((item) => item.initiative.companyId === id);
}
export function uniquePeople(items: InitiativeData[]): GraphNode[] {
  return [
    ...new Map(
      items
        .flatMap((item) => item.graph.nodes)
        .map((person) => [person.id, person]),
    ).values(),
  ];
}
export function history(items: InitiativeData[]): HistoryEntry[] {
  return items
    .flatMap((item) =>
      item.events.map((event) => ({
        ...event,
        initiativeId: item.initiative.id,
        initiativeName: item.initiative.name,
      })),
    )
    .sort(
      (a, b) =>
        Date.parse(b.occurredAt) - Date.parse(a.occurredAt) ||
        b.id.localeCompare(a.id),
    );
}
export function snapshot(items: InitiativeData[]) {
  return (
    items
      .map((item) => item.coverage.asOf)
      .sort()
      .at(-1) ?? null
  );
}
export function portfolioStats(data: WorkspaceData) {
  const entries = history(data.initiatives),
    asOf = snapshot(data.initiatives);
  const cutoff = asOf ? Date.parse(asOf) - 30 * 86400000 : 0;
  return {
    companies: data.companies.length,
    contacts: uniquePeople(data.initiatives).length,
    events: entries.filter(
      (event) =>
        Date.parse(event.occurredAt) > cutoff &&
        (!asOf || Date.parse(event.occurredAt) <= Date.parse(asOf)),
    ).length,
    risks: data.initiatives.reduce(
      (total, item) => total + relationshipHealth(item.coverage).risks.length,
      0,
    ),
  };
}

export function contactMatches(
  person: GraphNode,
  item: InitiativeData,
  filters: {
    search: string;
    role: string;
    department: string;
    influence: string;
    interaction: string;
    manager: string;
    job: string;
  },
) {
  const coverage = item.coverage.contacts.find((p) => p.id === person.id);
  return (
    (!filters.search ||
      [person.name, person.email, person.jobTitle].some((value) =>
        value
          ?.toLocaleLowerCase("ru")
          .includes(filters.search.trim().toLocaleLowerCase("ru")),
      )) &&
    (!filters.role || person.role?.code === filters.role) &&
    (!filters.department || person.department?.id === filters.department) &&
    (!filters.influence ||
      (person.influence ?? "UNKNOWN") === filters.influence) &&
    (!filters.job || person.jobTitle === filters.job) &&
    (!filters.interaction ||
      (filters.interaction === "UNKNOWN"
        ? !coverage?.lastTouchAt
        : coverage?.touchStatus === filters.interaction)) &&
    (!filters.manager ||
      item.events.some(
        (event) =>
          event.responsibleManager === filters.manager &&
          event.participants.some((p) => p.id === person.id),
      ))
  );
}
export const influenceLabels: Record<string, string> = {
  HIGH: "Высокое",
  MEDIUM: "Среднее",
  LOW: "Низкое",
  UNKNOWN: "Не указано",
};
export function roleTone(code?: string) {
  return (
    (
      {
        BUDGET_APPROVER: "violet",
        PROJECT_SPONSOR: "green",
        TECHNICAL_EXPERT: "blue",
        CONSULTANT: "amber",
        PROCUREMENT_LEAD: "rose",
      } as Record<string, string>
    )[code ?? ""] ?? "gray"
  );
}
