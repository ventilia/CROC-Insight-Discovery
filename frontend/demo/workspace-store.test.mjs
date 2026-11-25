import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createStore } from "./store.mjs";
import { startServer } from "./server.mjs";
const iid = "20000000-0000-4000-8000-000000000001";
const person = (name, email) => ({
  name,
  email,
  jobTitle: "Архитектор",
  department: "Новый отдел",
  decisionMaker: true,
  roleLabel: "Согласует требования",
  mandate: "Технические требования",
  influence: "HIGH",
  influenceBasis: "Назначен ответственным на встрече",
  interest: "Сроки внедрения",
  sourceLabel: "Протокол встречи",
});
test("создание проекта, участников и связи сохраняется после перезапуска; версия защищает правки", () => {
  const dir = mkdtempSync(join(tmpdir(), "kit-workspace-")),
    file = join(dir, "test.sqlite");
  let store = createStore(file);
  try {
    const cid = store.companies()[0].id;
    const project = store.createProject(cid, {
      name: "Новый проект",
      owner: "Менеджер",
      stage: "Подготовка",
      due: "2026-12-15",
      nextStep: "Собрать требования",
    });
    assert.throws(() => store.createProject(cid, { name: " новый проект " }), {
      status: 409,
    });
    assert.throws(
      () => store.createProject(cid, { name: "Invalid", due: "2026-02-31" }),
      { status: 400 },
    );
    const a = store.saveParticipant(
      project.id,
      null,
      person("Иван", "a@example.com"),
    );
    const b = store.saveParticipant(
      project.id,
      null,
      person("Анна", "b@example.com"),
    );
    const edge = {
      source: a.id,
      target: b.id,
      type: "COORDINATION",
      label: "Передаёт требования",
      confirmed: true,
      sourceLabel: "Протокол",
    };
    store.createRelationship(project.id, edge);
    assert.throws(() => store.createRelationship(project.id, edge), {
      status: 409,
    });
    assert.throws(
      () => store.createRelationship(project.id, { ...edge, target: a.id }),
      { status: 400 },
    );
    assert.throws(
      () => store.createRelationship(project.id, { ...edge, sourceLabel: "" }),
      { status: 400 },
    );
    const before = store.graph(project.id).nodes.find((p) => p.id === a.id);
    store.saveParticipant(project.id, a.id, {
      ...person("Иван обновлён", "a@example.com"),
      expectedVersion: before.editVersion,
    });
    assert.throws(
      () =>
        store.saveParticipant(project.id, a.id, {
          ...person("Не должно сохраниться", "a@example.com"),
          department: "Отдел из устаревшей формы",
          expectedVersion: before.editVersion,
        }),
      { status: 409 },
    );
    assert.throws(
      () =>
        store.saveParticipant(project.id, null, {
          ...person("Invalid", "bad@example.com"),
          influenceBasis: "",
        }),
      { status: 400 },
    );
    const request = store.createRequest(project.id, {
      personId: a.id,
      recipient: "Команда продаж",
      question: "Уточнить полномочия",
    });
    store.updateRequest(project.id, request.id, { status: "DONE" });
    store.close();
    store = createStore(file);
    assert.equal(store.graph(project.id).nodes.length, 2);
    const saved = store.dossier(project.id, a.id).person;
    assert.equal(saved.name, "Иван обновлён");
    assert.equal(saved.interest, "Сроки внедрения");
    assert.equal(saved.mandate, "Технические требования");
    assert.equal(saved.editVersion, 1);
    assert.equal(store.graph(project.id).edges[0].sourceLabel, "Протокол");
    assert.equal(store.requests(project.id)[0].status, "DONE");
    assert.equal(
      store.initiatives(cid).find((p) => p.id === project.id).owner,
      "Менеджер",
    );
    assert.throws(
      () => store.updateRequest(iid, request.id, { status: "DRAFT" }),
      { status: 404 },
    );
    const outsider = store.graph(iid).nodes[0].id;
    assert.throws(
      () => store.createRelationship(project.id, { ...edge, target: outsider }),
      { status: 404 },
    );
    assert.throws(
      () =>
        store.createRequest(project.id, {
          personId: outsider,
          recipient: "Кто-то",
          question: "Вопрос",
        }),
      { status: 404 },
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("новые HTTP-маршруты защищены CSRF и возвращают сохранённые запросы", async () => {
  const server = startServer({ port: 0, filename: ":memory:" });
  await once(server, "listening");
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const rejected = await fetch(`${base}/initiatives/${iid}/people`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(person("Иван", "test@example.com")),
    });
    assert.equal(rejected.status, 403);
    const csrf = await fetch(base + "/csrf"),
      token = await csrf.json();
    const headers = {
      "Content-Type": "application/json",
      Cookie: csrf.headers.get("set-cookie").split(";")[0],
      [token.headerName]: token.token,
    };
    const created = await fetch(`${base}/initiatives/${iid}/people`, {
      method: "POST",
      headers,
      body: JSON.stringify(person("Иван", "test@example.com")),
    });
    assert.equal(created.status, 201);
    const p = await created.json();
    const request = await fetch(`${base}/initiatives/${iid}/requests`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        personId: p.id,
        recipient: "Менеджер",
        question: "Уточнить сроки",
      }),
    });
    assert.equal(request.status, 201);
    const list = await (
      await fetch(`${base}/initiatives/${iid}/requests`)
    ).json();
    assert.equal(list.length, 1);
    assert.equal(list[0].personId, p.id);
    const crossOrigin = await fetch(
      `${base}/initiatives/${iid}/relationships`,
      {
        method: "POST",
        headers: { ...headers, Origin: "https://untrusted.example" },
        body: "{}",
      },
    );
    assert.equal(crossOrigin.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
