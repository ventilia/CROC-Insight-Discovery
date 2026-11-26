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
import type {
  CompanyInsights,
  CompanyProfile,
  DashboardFacts,
  HealthFacts,
} from "./companyApi";

export type InitiativeData = {
  initiative: Initiative;
  graph: Graph;
  coverage: Coverage;
  events: Touchpoint[];
  health?: HealthFacts;
  managers?: { name: string; contactIds: string[] }[];
};
export type WorkspaceData = {
  companies: Company[];
  initiatives: InitiativeData[];
  dashboard?: DashboardFacts;
  profile?: CompanyProfile;
  insights?: CompanyInsights;
  companyEvents?: EventPage;
  capabilities: {
    mode: string;
    canCreateEvents: boolean;
    canImportContacts?: boolean;
    canManageWorkspace?: boolean;
  };
};
export type HistoryEntry = Touchpoint & {
  initiativeId: string;
  initiativeName: string;
};

type Scope = {
  companyId?: string;
  projectId?: string;
  view?: string;
  personId?: string;
};

export function emptyProject(
  initiative: Initiative,
  days: number,
): InitiativeData {
  return {
    initiative,
    graph: {
      companyId: initiative.companyId,
      initiativeId: initiative.id,
      asOf: initiative.asOf,
      nodes: [],
      edges: [],
      filters: { departments: [], roles: [] },
    },
    coverage: {
      initiativeId: initiative.id,
      asOf: initiative.asOf,
      days,
      verificationDays: 90,
      contacts: [],
      departments: [],
    },
    events: [],
  };
}

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
  scope: Scope = {},
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
  if (capabilities.mode === "api") {
    const companyId = companies.find(
      (company) => company.id === scope.companyId,
    )?.id;
    const base = { companies, capabilities };
    if (!companyId) {
      const dashboard = await api<DashboardFacts>("/dashboard?days=30", {
        signal,
      });
      return { ...base, initiatives: [], dashboard };
    }
    const client = `/companies/${companyId}`;
    const view = scope.view ?? "overview";
    const [profile, insights, companyEvents] = await Promise.all([
      api<CompanyProfile>(client, { signal }),
      view === "insights"
        ? api<CompanyInsights>(`${client}/insights?days=${days}`, { signal })
        : undefined,
      view === "overview"
        ? api<EventPage>(
            `${client}/events?${new URLSearchParams({ limit: "4", through: new Date().toISOString() })}`,
            { signal },
          )
        : undefined,
    ]);
    const activeId = scope.projectId ?? profile.initiatives[0]?.id;
    const initiatives = await Promise.all(
      profile.initiatives.map(async (initiative) => {
        const item = emptyProject(initiative, days);
        const active = initiative.id === activeId;
        const scopedContacts = view === "contacts" && !!scope.projectId;
        const needsGraph =
          active &&
          (["map", "person", "requests"].includes(view) || scopedContacts);
        const needsCoverage =
          active && (["map", "person"].includes(view) || scopedContacts);
        const project = `/initiatives/${initiative.id}`;
        const [graph, coverage, managers, health] = await Promise.all([
          needsGraph ? api<Graph>(`${project}/graph`, { signal }) : item.graph,
          needsCoverage
            ? api<Coverage>(`${project}/coverage?days=${days}`, { signal })
            : item.coverage,
          active && (scopedContacts || view === "map" || view === "person")
            ? api<InitiativeData["managers"]>(
                `${project}/interaction-managers`,
                { signal },
              )
            : undefined,
          active && view === "insights"
            ? api<HealthFacts>(`${project}/relationship-health?days=${days}`, {
                signal,
              })
            : undefined,
        ]);
        return { ...item, graph, coverage, managers, health };
      }),
    );
    return { ...base, initiatives, profile, insights, companyEvents };
  }
  const initiatives: InitiativeData[] = [];
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

export function useWorkspace(days: number, scope: Scope) {
  const { companyId, projectId, view, personId } = scope;
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([
    days,
    revision,
    companyId,
    projectId,
    view,
    personId,
  ]);
  const [state, setState] = useState<{
    key?: string;
    data: WorkspaceData | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });
  useEffect(() => {
    const controller = new AbortController();
    setState((old) => ({ ...old, loading: true, error: null }));
    loadWorkspace(days, controller.signal, {
      companyId,
      projectId,
      view,
      personId,
    }).then(
      (data) => {
        if (!controller.signal.aborted)
          setState({ key, data, loading: false, error: null });
      },
      (error) => {
        if (!controller.signal.aborted)
          setState((old) => ({
            ...old,
            key,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Не удалось загрузить данные.",
          }));
      },
    );
    return () => controller.abort();
  }, [key, days, companyId, projectId, view, personId]);
  return {
    ...state,
    loading: state.loading || state.key !== key,
    revision,
    refresh: () => setRevision((value) => value + 1),
  };
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
  if (data.dashboard)
    return {
      companies: data.dashboard.accessibleCompanyCount,
      contacts: data.dashboard.registeredContactCount,
      events: data.dashboard.activeInteractionCount,
      risks: data.dashboard.riskCount,
    };
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
    stance?: string;
    decisionMaker?: string;
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
    (!filters.stance || (person.stance ?? "UNKNOWN") === filters.stance) &&
    (!filters.decisionMaker ||
      person.decisionMaker === (filters.decisionMaker === "yes")) &&
    (!filters.role || person.role?.code === filters.role) &&
    (!filters.department ||
      (filters.department === "UNASSIGNED"
        ? !person.department
        : person.department?.id === filters.department)) &&
    (!filters.influence ||
      (person.influence ?? "UNKNOWN") === filters.influence) &&
    (!filters.job || person.jobTitle === filters.job) &&
    (!filters.interaction ||
      (filters.interaction === "UNKNOWN"
        ? !coverage?.lastTouchAt
        : coverage?.touchStatus === filters.interaction)) &&
    (!filters.manager ||
      (item.managers
        ? item.managers.some(
            (manager) =>
              manager.name === filters.manager &&
              manager.contactIds.includes(person.id),
          )
        : item.events.some(
            (event) =>
              event.responsibleManager === filters.manager &&
              event.participants.some((p) => p.id === person.id),
          )))
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
