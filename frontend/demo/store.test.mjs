import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createStore } from "./store.mjs";
import { startServer } from "./server.mjs";
const iid = "20000000-0000-4000-8000-000000000001",
  pid = "40000000-0000-4000-8000-000000000003";
const payload = () => ({
  id: randomUUID(),
  type: "MEETING",
  occurredAt: "2026-11-24T10:00:00.000Z",
  team: "Продажи",
  subject: "Встреча по требованиям",
  responsibleManager: "Елена Иванова",
  participantIds: [pid],
  outcome: "Согласован план",
  nextStep: "Подготовить расчёт",
});

test("демосрез: профили, компании, пагинация и история по инициативе", () => {
  const store = createStore(":memory:");
  try {
    assert.equal(store.companies().length, 2);
    assert.equal(store.graph(iid).nodes.length, 4);
    const filtered = store.graph(iid, { roleCode: "BUDGET_APPROVER" });
    assert.equal(filtered.nodes.length, 1);
    assert.equal(filtered.edges.length, 0);
    assert.equal(filtered.filters.roles.length, 3);
    assert.equal(store.graph(iid).nodes[0].influence, "HIGH");
    assert.match(
      store.dossier(iid, store.graph(iid).nodes[0].id).person.email,
      /@severnaya.example$/,
    );
    assert.equal(
      store.coverage(iid, 7).contacts.filter((p) => p.touchStatus === "RECENT")
        .length,
      2,
    );
    const first = store.events(iid, { limit: "1" }),
      next = store.events(iid, { limit: "1", cursor: first.nextCursor });
    assert.notEqual(first.items[0].id, next.items[0].id);
    assert.equal(store.events(iid, { personId: pid }).items.length, 1);
    assert.throws(
      () => store.events(iid, { personId: pid, cursor: first.nextCursor }),
      { status: 400 },
    );
  } finally {
    store.close();
  }
});
test("сохранение атомарно, повтор запроса не дублирует событие, данные переживают перезапуск", () => {
  const dir = mkdtempSync(join(tmpdir(), "kit-store-")),
    file = join(dir, "test.sqlite");
  let store = createStore(file);
  try {
    const value = payload(),
      before = store.events(iid).items.length;
    assert.deepEqual(store.createEvent(iid, value), { id: value.id });
    store.createEvent(iid, value);
    assert.equal(store.events(iid).items.length, before + 1);
    assert.throws(
      () => store.createEvent(iid, { ...value, subject: "Другое событие" }),
      { status: 409 },
    );
    const saved = store
      .events(iid, { personId: pid })
      .items.find((e) => e.id === value.id);
    assert.equal(saved.responsibleManager, "Елена Иванова");
    assert.equal(saved.nextStep, "Подготовить расчёт");
    assert.equal(
      store.coverage(iid, 30).contacts.find((p) => p.id === pid).lastTouchAt,
      value.occurredAt,
    );
    store.close();
    store = createStore(file);
    assert.ok(store.events(iid).items.some((e) => e.id === value.id));
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("валидация отклоняет будущее, чужих участников и пустой ввод без частичной записи", () => {
  const store = createStore(":memory:");
  try {
    const before = store.events(iid).items.length;
    for (const patch of [
      { subject: " " },
      { participantIds: [] },
      { participantIds: ["40000000-0000-4000-8000-000000000004"] },
      { participantIds: [pid, pid] },
      { occurredAt: "2999-01-01T00:00:00Z" },
      { responsibleManager: "" },
      { type: "INVALID" },
      { outcome: 42 },
    ]) {
      assert.throws(() => store.createEvent(iid, { ...payload(), ...patch }), {
        status: 400,
      });
    }
    assert.equal(store.events(iid).items.length, before);
    assert.throws(() => store.coverage(iid, 0), { status: 400 });
  } finally {
    store.close();
  }
});
test("редактор позиции проверяет версию и сохраняет автора", () => {
  const store = createStore(":memory:");
  try {
    const value = {
      expectedVersion: 0,
      stance: "SUPPORTS",
      basis: "Подтверждено на встрече",
    };
    const result = store.savePosition(iid, pid, value);
    assert.equal(result.version, 1);
    assert.equal(result.position.author, "local-demo");
    assert.throws(() => store.savePosition(iid, pid, value), { status: 409 });
  } finally {
    store.close();
  }
});
test("HTTP API требует CSRF, сохраняет запись, блокирует чужой Origin и недоступные ID", async () => {
  const server = startServer({ port: 0, filename: ":memory:" });
  await once(server, "listening");
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const denied = await fetch(`${base}/initiatives/${iid}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    });
    assert.equal(denied.status, 403);
    const csrf = await fetch(base + "/csrf"),
      token = await csrf.json(),
      cookie = csrf.headers.get("set-cookie").split(";")[0];
    const headers = {
      "Content-Type": "application/json",
      [token.headerName]: token.token,
      Cookie: cookie,
    };
    const badOrigin = await fetch(`${base}/initiatives/${iid}/events`, {
      method: "POST",
      headers: { ...headers, Origin: "https://untrusted.example" },
      body: JSON.stringify(payload()),
    });
    assert.equal(badOrigin.status, 403);
    const saved = await fetch(`${base}/initiatives/${iid}/events`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload()),
    });
    assert.equal(saved.status, 201);
    const missing = await fetch(
      `${base}/initiatives/20000000-0000-4000-8000-000000000099/graph`,
    );
    assert.equal(missing.status, 404);
    const capabilities = await (await fetch(base + "/capabilities")).json();
    assert.equal(capabilities.canCreateEvents, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
