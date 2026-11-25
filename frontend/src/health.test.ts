import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { Coverage } from "./coverage.ts";
import { relationshipHealth } from "./health.ts";

const coverage: Coverage = JSON.parse(readFileSync(new URL("../../backend/examples/coverage.json", import.meta.url), "utf8"));

test("индекс на демосрезе учитывает ЛПР, отделы и проверку данных раздельно", () => {
  const health = relationshipHealth(coverage);
  assert.equal(health.score, 80);
  assert.equal(health.active, 2);
  assert.equal(health.verified, 1);
  assert.equal(health.departments, 2);
  assert.ok(health.risks.some((risk) => risk.includes("без записей")));
  assert.ok(health.risks.some((risk) => risk.includes("не указан отдел")));
});

test("один активный ЛПР отмечается как риск, нулевой охват не скрывается", () => {
  const data = structuredClone(coverage);
  data.contacts[0].touchStatus = "STALE";
  assert.ok(relationshipHealth(data).risks.some((risk) => risk.includes("только с одним ЛПР: Александр Волков")));
  data.contacts.forEach((person) => { person.touchStatus = "UNKNOWN"; person.verificationStatus = "UNKNOWN"; });
  data.departments.forEach((department) => { department.recentCount = 0; });
  assert.equal(relationshipHealth(data).score, 0);
  assert.ok(relationshipHealth(data).risks.some((risk) => risk.includes("Нет недавних")));
});

test("пустые данные и неопределённые роли не превращаются в ложный индекс", () => {
  assert.equal(relationshipHealth({ ...coverage, contacts: [], departments: [] }).score, null);
  assert.equal(relationshipHealth({ ...coverage, departments: [] }).score, null);
  const noRoles = { ...coverage, contacts: coverage.contacts.map((person) => ({ ...person, decisionMaker: false })) };
  assert.equal(relationshipHealth(noRoles).score, null);
  assert.ok(relationshipHealth(noRoles).risks.some((risk) => risk.includes("ЛПР пока не определены")));
});
