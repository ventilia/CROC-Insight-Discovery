import assert from "node:assert/strict";
import test from "node:test";
import { meetingBrief, selectContacts, summarizeCoverage, type ContactCoverage } from "./coverage.ts";

const contacts: ContactCoverage[] = [
  {
    id: "a", name: "Марина", jobTitle: "Финансовый директор", decisionMaker: true,
    department: { id: "fin", name: "Финансы" },
    lastTouchAt: "2026-11-18T10:00:00Z", touchStatus: "RECENT",
    lastVerifiedAt: "2026-08-01T09:00:00Z", verificationStatus: "STALE",
  },
  {
    id: "b", name: "Дарья", jobTitle: null, decisionMaker: false,
    department: { id: "sec", name: "ИБ" },
    lastTouchAt: "2026-11-12T08:30:00Z", touchStatus: "STALE",
    lastVerifiedAt: null, verificationStatus: "UNKNOWN",
  },
  {
    id: "c", name: "Никита", jobTitle: null, decisionMaker: false, department: null,
    lastTouchAt: null, touchStatus: "UNKNOWN", lastVerifiedAt: null, verificationStatus: "UNKNOWN",
  },
];

test("фильтр ЛПР учитывает свежесть данных отдельно от касаний", () => {
  assert.deepEqual(selectContacts(contacts, "verification", null).map(({ id }) => id), ["a"]);
  assert.deepEqual(selectContacts(contacts, "stale", "fin"), []);
  assert.deepEqual(selectContacts(contacts, "unknown", null).map(({ id }) => id), ["c"]);
});

test("сводка различает давнее касание, отсутствие истории и неизвестный охват", () => {
  assert.deepEqual(summarizeCoverage(contacts), { recent: 1, stale: 1, unknown: 1, verification: 1, percent: 33 });
  assert.equal(summarizeCoverage([]).percent, null);
});

test("список к встрече сохраняет основания сигналов", () => {
  const text = meetingBrief("Пилот", "2026-11-24T09:00:00Z", 7, contacts);
  assert.match(text, /Марина.*данные ЛПР требуют проверки/);
  assert.match(text, /Дарья.*давнее касание/);
  assert.match(text, /Никита.*нет записей/);
});
