import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  contactMatches,
  portfolioStats,
  type InitiativeData,
  type WorkspaceData,
} from "./workspace.ts";
const example = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL("../../backend/examples/" + name + ".json", import.meta.url),
      "utf8",
    ),
  );
const item: InitiativeData = {
  initiative: example("initiatives")[0],
  graph: example("graph"),
  coverage: example("coverage"),
  events: example("events-person").items.map((event: object) => ({
    ...event,
    responsibleManager: "Анна",
  })),
};

test("портфель не удваивает общих людей и отделяет события старше 30 дней", () => {
  const other = structuredClone(item);
  other.initiative = { ...item.initiative, id: "another" };
  other.events = [
    { ...item.events[0], id: "old", occurredAt: "2025-01-01T00:00:00Z" },
  ];
  const workspace: WorkspaceData = {
    companies: example("companies"),
    initiatives: [item, other],
    capabilities: { mode: "demo", canCreateEvents: true },
  };
  const stats = portfolioStats(workspace);
  assert.equal(stats.contacts, 4);
  assert.equal(stats.events, 2);
  assert.equal(stats.companies, 2);
});

test("комбинация влияния, касаний, должности и ответственного менеджера фильтрует по инициативе", () => {
  const filters = {
    search: "",
    role: "",
    department: "",
    influence: "",
    interaction: "",
    manager: "",
    job: "",
  };
  const person = { ...item.graph.nodes[0], influence: "HIGH" as const };
  assert.equal(
    contactMatches(person, item, {
      ...filters,
      influence: "HIGH",
      interaction: "RECENT",
      manager: "Анна",
      job: "Финансовый директор",
    }),
    true,
  );
  assert.equal(
    contactMatches(person, item, { ...filters, manager: "Другой менеджер" }),
    false,
  );
  assert.equal(
    contactMatches(person, item, { ...filters, influence: "LOW" }),
    false,
  );
  assert.equal(
    contactMatches(item.graph.nodes[3], item, {
      ...filters,
      influence: "UNKNOWN",
      interaction: "UNKNOWN",
    }),
    true,
  );
});
