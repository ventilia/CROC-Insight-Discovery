import type { Coverage } from "./coverage.ts";

export function relationshipHealth(data: Coverage) {
  const decisionMakers = data.contacts.filter((person) => person.decisionMaker);
  const active = decisionMakers.filter((person) => person.touchStatus === "RECENT");
  const verified = decisionMakers.filter((person) => person.verificationStatus === "RECENT");
  const departments = data.departments.filter((department) => department.recentCount > 0);
  const unknown = data.contacts.filter((person) => person.touchStatus === "UNKNOWN").length;
  // Pilot heuristic over the complete initiative, independent of UI filters.
  const score = decisionMakers.length && data.departments.length
    ? Math.round(50 * active.length / decisionMakers.length +
      30 * departments.length / data.departments.length + 20 * verified.length / decisionMakers.length)
    : null;
  const risks: string[] = [];
  if (!decisionMakers.length) risks.push("ЛПР пока не определены. Уточните роли участников.");
  else if (!active.length) risks.push("Нет недавних касаний с ЛПР в доступной истории.");
  else if (active.length === 1) risks.push("Недавний контакт есть только с одним ЛПР: " + active[0].name + ". Расширьте круг контактов.");
  if (verified.length < decisionMakers.length) risks.push("Данные ЛПР требуют проверки: " + (decisionMakers.length - verified.length) + ".");
  if (departments.length < data.departments.length) risks.push("Подразделения без недавних касаний: " + (data.departments.length - departments.length) + ".");
  if (unknown) risks.push("Участники без записей о касаниях: " + unknown + ". Уточните историю.");
  if (data.contacts.some((person) => !person.department)) risks.push("У части участников не указан отдел. Охват подразделений может быть неполным.");
  return { score, active: active.length, decisionMakers: decisionMakers.length,
    verified: verified.length, departments: departments.length, totalDepartments: data.departments.length, risks };
}
