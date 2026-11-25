import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const checkId = (id) => {
  if (typeof id !== "string" || !uuid.test(id))
    throw new HttpError(400, "Некорректный ID.");
  return id;
};
const text = (value, max, required = false) => {
  if (value == null && !required) return null;
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new HttpError(400, "Проверьте обязательные поля и длину текста.");
  return value.trim() || null;
};
const date = (value) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new HttpError(400, "Некорректная дата.");
  return new Date(value).toISOString();
};
const recent = (at, asOf, days) =>
  !at
    ? "UNKNOWN"
    : Date.parse(at) <= Date.parse(asOf) - days * 86400000
      ? "STALE"
      : "RECENT";

export function createStore(filename) {
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, name TEXT NOT NULL, industry TEXT, description TEXT);
    CREATE TABLE IF NOT EXISTS company_viewers (viewer_key TEXT, company_id TEXT REFERENCES companies(id), PRIMARY KEY(viewer_key,company_id));
    CREATE TABLE IF NOT EXISTS departments (id TEXT PRIMARY KEY, company_id TEXT REFERENCES companies(id), name TEXT);
    CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, company_id TEXT REFERENCES companies(id), department_id TEXT REFERENCES departments(id), name TEXT, job_title TEXT, verified_at TEXT, email TEXT, phone TEXT);
    CREATE TABLE IF NOT EXISTS initiatives (id TEXT PRIMARY KEY, company_id TEXT REFERENCES companies(id), name TEXT, as_of TEXT);
    CREATE TABLE IF NOT EXISTS participant_roles (code TEXT PRIMARY KEY, label TEXT);
    CREATE TABLE IF NOT EXISTS initiative_participants (initiative_id TEXT REFERENCES initiatives(id), company_id TEXT REFERENCES companies(id), contact_id TEXT REFERENCES contacts(id), role_code TEXT REFERENCES participant_roles(code), decision_maker INTEGER, influence TEXT, influence_basis TEXT, PRIMARY KEY(initiative_id,contact_id));
    CREATE TABLE IF NOT EXISTS relationships (id TEXT PRIMARY KEY, initiative_id TEXT REFERENCES initiatives(id), source_contact_id TEXT, target_contact_id TEXT, type TEXT, label TEXT, confirmed INTEGER, FOREIGN KEY(initiative_id,source_contact_id) REFERENCES initiative_participants(initiative_id,contact_id), FOREIGN KEY(initiative_id,target_contact_id) REFERENCES initiative_participants(initiative_id,contact_id));
    CREATE TABLE IF NOT EXISTS touchpoints (id TEXT PRIMARY KEY, initiative_id TEXT REFERENCES initiatives(id), type TEXT, occurred_at TEXT, team TEXT, subject TEXT, outcome TEXT, next_step TEXT, source_label TEXT, responsible_manager TEXT, created_by TEXT, request_fingerprint TEXT, UNIQUE(initiative_id,id));
    CREATE TABLE IF NOT EXISTS touchpoint_participants (initiative_id TEXT, touchpoint_id TEXT, contact_id TEXT, PRIMARY KEY(initiative_id,touchpoint_id,contact_id), FOREIGN KEY(initiative_id,touchpoint_id) REFERENCES touchpoints(initiative_id,id), FOREIGN KEY(initiative_id,contact_id) REFERENCES initiative_participants(initiative_id,contact_id));
    CREATE TABLE IF NOT EXISTS stance_revisions (initiative_id TEXT, contact_id TEXT, version INTEGER, stance TEXT, basis TEXT, changed_by TEXT, changed_at TEXT DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), PRIMARY KEY(initiative_id,contact_id,version), FOREIGN KEY(initiative_id,contact_id) REFERENCES initiative_participants(initiative_id,contact_id));
    CREATE INDEX IF NOT EXISTS events_time ON touchpoints(initiative_id,occurred_at DESC,id DESC);
  `);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  if (!get("SELECT id FROM companies LIMIT 1")) {
    db.exec("BEGIN");
    try {
      for (const name of [
        "R__seed_demo_map.sql",
        "R__seed_touchpoints.sql",
        "R__seed_verification.sql",
        "R__seed_stances.sql",
        "R__seed_zz_kit_profiles.sql",
      ]) {
        const sql = readFileSync(
          fileURLToPath(
            new URL(
              "../../backend/src/main/resources/db/demo/" + name,
              import.meta.url,
            ),
          ),
          "utf8",
        );
        db.exec(sql.replace(/::(?:uuid|timestamptz)/g, ""));
      }
      for (const [table, col] of [
        ["initiatives", "as_of"],
        ["contacts", "verified_at"],
        ["touchpoints", "occurred_at"],
        ["stance_revisions", "changed_at"],
      ]) {
        for (const row of all(
          `SELECT rowid AS _row, ${col} AS at FROM ${table} WHERE ${col} IS NOT NULL`,
        ))
          run(
            `UPDATE ${table} SET ${col}=? WHERE rowid=?`,
            new Date(row.at).toISOString(),
            row._row,
          );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      throw error;
    }
  }
  const initiative = (id) =>
    get("SELECT * FROM initiatives WHERE id=?", checkId(id)) ??
    (() => {
      throw new HttpError(404, "Инициатива недоступна.");
    })();
  const people = (id) =>
    all(
      `SELECT c.*, p.role_code, p.decision_maker, p.influence, p.influence_basis FROM contacts c JOIN initiative_participants p ON p.contact_id=c.id WHERE p.initiative_id=? ORDER BY c.id`,
      id,
    ).map((row) => ({
      id: row.id,
      name: row.name,
      jobTitle: row.job_title,
      department: row.department_id
        ? get("SELECT id,name FROM departments WHERE id=?", row.department_id)
        : null,
      role: row.role_code
        ? get(
            "SELECT code,label FROM participant_roles WHERE code=?",
            row.role_code,
          )
        : null,
      decisionMaker: !!row.decision_maker,
      influence: row.influence,
      influenceBasis: row.influence_basis,
      email: row.email,
      phone: row.phone,
    }));
  const position = (iid, pid) =>
    get(
      "SELECT version,stance,basis,changed_by AS author,changed_at AS changedAt FROM stance_revisions WHERE initiative_id=? AND contact_id=? ORDER BY version DESC LIMIT 1",
      iid,
      pid,
    ) ?? null;
  const member = (iid, pid) => {
    initiative(iid);
    const p = people(iid).find((p) => p.id === checkId(pid));
    if (!p) throw new HttpError(404, "Участник недоступен.");
    return p;
  };
  function events(iid, query = {}) {
    initiative(iid);
    const pid = query.personId ? checkId(query.personId) : null;
    if (pid) member(iid, pid);
    const limit = Number(query.limit ?? 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new HttpError(400, "Некорректный размер страницы.");
    const through = query.through ? date(query.through) : null;
    let list = all(
      `SELECT * FROM touchpoints t WHERE t.initiative_id=? AND (? IS NULL OR t.occurred_at<=?) AND (? IS NULL OR EXISTS(SELECT 1 FROM touchpoint_participants p WHERE p.touchpoint_id=t.id AND p.contact_id=?)) ORDER BY occurred_at DESC,id DESC`,
      iid,
      through,
      through,
      pid,
      pid,
    );
    if (query.cursor) {
      const index = list.findIndex((e) => e.id === checkId(query.cursor));
      if (index < 0)
        throw new HttpError(400, "Курсор не соответствует истории.");
      list = list.slice(index + 1);
    }
    const page = list.slice(0, limit);
    return {
      items: page.map((e) => ({
        id: e.id,
        type: e.type,
        occurredAt: e.occurred_at,
        team: e.team,
        subject: e.subject,
        outcome: e.outcome,
        nextStep: e.next_step,
        sourceLabel: e.source_label,
        responsibleManager: e.responsible_manager,
        author: e.created_by,
        participants: all(
          "SELECT c.id,c.name FROM contacts c JOIN touchpoint_participants p ON p.contact_id=c.id WHERE p.touchpoint_id=? ORDER BY c.id",
          e.id,
        ),
      })),
      nextCursor: list.length > limit ? page.at(-1).id : null,
    };
  }
  function coverage(iid, days = 30) {
    const i = initiative(iid);
    days = Number(days);
    if (!Number.isInteger(days) || days < 1 || days > 365)
      throw new HttpError(400, "Некорректный период.");
    const contacts = people(iid).map((p) => {
      const at = get(
        `SELECT max(t.occurred_at) AS at FROM touchpoints t JOIN touchpoint_participants x ON x.touchpoint_id=t.id WHERE t.initiative_id=? AND x.contact_id=? AND t.occurred_at<=?`,
        iid,
        p.id,
        i.as_of,
      ).at;
      const v = get(
        "SELECT verified_at FROM contacts WHERE id=?",
        p.id,
      ).verified_at;
      const verified = v && v <= i.as_of ? v : null;
      return {
        ...p,
        lastTouchAt: at,
        touchStatus: recent(at, i.as_of, days),
        lastVerifiedAt: verified,
        verificationStatus: recent(verified, i.as_of, 90),
      };
    });
    const departments = [
      ...new Map(
        contacts
          .filter((p) => p.department)
          .map((p) => [p.department.id, p.department]),
      ).values(),
    ]
      .map((d) => {
        const members = contacts.filter((p) => p.department?.id === d.id);
        const at =
          members
            .map((p) => p.lastTouchAt)
            .filter(Boolean)
            .sort()
            .at(-1) ?? null;
        return {
          ...d,
          participantCount: members.length,
          recentCount: members.filter((p) => p.touchStatus === "RECENT").length,
          lastTouchAt: at,
          touchStatus: recent(at, i.as_of, days),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return {
      initiativeId: iid,
      asOf: i.as_of,
      days,
      verificationDays: 90,
      contacts,
      departments,
    };
  }
  function createEvent(iid, value) {
    initiative(iid);
    checkId(value.id);
    if (!["MEETING", "CALL", "EMAIL", "NOTE", "PROPOSAL"].includes(value.type))
      throw new HttpError(400, "Некорректный тип события.");
    const occurredAt = date(value.occurredAt);
    if (Date.parse(occurredAt) > Date.now())
      throw new HttpError(400, "Взаимодействие не может быть в будущем.");
    const subject = text(value.subject, 300, true),
      team = text(value.team, 160, true),
      manager = text(value.responsibleManager, 160, true),
      outcome = text(value.outcome, 2000),
      nextStep = text(value.nextStep, 2000);
    const ids = value.participantIds;
    if (
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > 50 ||
      new Set(ids).size !== ids.length
    )
      throw new HttpError(400, "Выберите участников.");
    const valid = new Set(people(iid).map((p) => p.id));
    if (ids.some((id) => !valid.has(checkId(id))))
      throw new HttpError(
        400,
        "Участники должны относиться к выбранной инициативе.",
      );
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          iid,
          value.type,
          occurredAt,
          subject,
          team,
          manager,
          outcome,
          nextStep,
          [...ids].sort(),
        ]),
      )
      .digest("hex");
    const existing = get(
      "SELECT request_fingerprint FROM touchpoints WHERE id=?",
      value.id,
    );
    if (existing) {
      if (existing.request_fingerprint !== fingerprint)
        throw new HttpError(
          409,
          "Этот ID уже использован для другого события.",
        );
      return { id: value.id };
    }
    db.exec("BEGIN");
    try {
      run(
        `INSERT INTO touchpoints (id,initiative_id,type,occurred_at,team,subject,outcome,next_step,source_label,responsible_manager,created_by,request_fingerprint) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        value.id,
        iid,
        value.type,
        occurredAt,
        team,
        subject,
        outcome,
        nextStep,
        "Запись KIT",
        manager,
        "local-demo",
        fingerprint,
      );
      for (const id of ids)
        run(
          "INSERT INTO touchpoint_participants VALUES (?,?,?)",
          iid,
          value.id,
          id,
        );
      run(
        "UPDATE initiatives SET as_of=max(as_of,?) WHERE id=?",
        new Date().toISOString(),
        iid,
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return { id: value.id };
  }
  function importContacts(iid, value) {
    const i = initiative(iid);
    if (
      !Array.isArray(value.contacts) ||
      !value.contacts.length ||
      value.contacts.length > 500
    )
      throw new HttpError(400, "Ожидается от 1 до 500 контактов.");
    const records = value.contacts.map((p) => {
      if (!p || Array.isArray(p) || typeof p !== "object")
        throw new HttpError(400, "Некорректный контакт.");
      const result = {
        name: text(p.name, 200, true),
        jobTitle: text(p.jobTitle, 300),
        department: text(p.department, 160),
        email: text(p.email, 254),
        phone: text(p.phone, 60),
      };
      if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))
        throw new HttpError(400, "Некорректный email.");
      return result;
    });
    const normalize = (s) => (s ?? "").trim().toLocaleLowerCase("ru");
    const nameKey = (name, job, department) =>
      JSON.stringify([name, job, department].map(normalize));
    let created = 0,
      attached = 0,
      skipped = 0;
    db.exec("BEGIN IMMEDIATE");
    try {
      const existing = all(
        "SELECT c.*, d.name AS department_name FROM contacts c LEFT JOIN departments d ON d.id=c.department_id WHERE c.company_id=?",
        i.company_id,
      );
      const emails = new Map(
        existing.filter((p) => p.email).map((p) => [normalize(p.email), p.id]),
      );
      const names = new Map(
        existing.map((p) => [
          nameKey(p.name, p.job_title, p.department_name),
          p.id,
        ]),
      );
      const departments = new Map(
        all(
          "SELECT id,name FROM departments WHERE company_id=?",
          i.company_id,
        ).map((d) => [normalize(d.name), d.id]),
      );
      for (const p of records) {
        const key = nameKey(p.name, p.jobTitle, p.department);
        let id = p.email ? emails.get(normalize(p.email)) : names.get(key);
        if (!id) {
          let did = p.department
            ? departments.get(normalize(p.department))
            : null;
          if (p.department && !did) {
            did = randomUUID();
            run(
              "INSERT INTO departments(id,company_id,name) VALUES (?,?,?)",
              did,
              i.company_id,
              p.department,
            );
            departments.set(normalize(p.department), did);
          }
          id = randomUUID();
          run(
            "INSERT INTO contacts(id,company_id,department_id,name,job_title,email,phone) VALUES (?,?,?,?,?,?,?)",
            id,
            i.company_id,
            did,
            p.name,
            p.jobTitle,
            p.email,
            p.phone,
          );
          if (p.email) emails.set(normalize(p.email), id);
          names.set(key, id);
          created++;
        }
        const result = run(
          "INSERT OR IGNORE INTO initiative_participants(initiative_id,company_id,contact_id,decision_maker,influence) VALUES (?,?,?,0,?)",
          iid,
          i.company_id,
          id,
          "UNKNOWN",
        );
        if (result.changes) attached++;
        else skipped++;
      }
      db.exec("COMMIT");
      return { created, attached, skipped };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return {
    close: () => db.close(),
    companies: () =>
      all("SELECT id,name,industry,description FROM companies ORDER BY id"),
    initiatives: (cid) => {
      checkId(cid);
      if (!get("SELECT id FROM companies WHERE id=?", cid))
        throw new HttpError(404, "Компания недоступна.");
      return all(
        "SELECT id,company_id AS companyId,name,as_of AS asOf FROM initiatives WHERE company_id=? ORDER BY id",
        cid,
      );
    },
    graph: (iid, query = {}) => {
      const i = initiative(iid),
        allNodes = people(iid);
      if (query.roleCode && !/^[A-Z][A-Z0-9_]{0,31}$/.test(query.roleCode))
        throw new HttpError(400, "Некорректная роль.");
      if (query.departmentId) checkId(query.departmentId);
      const nodes = allNodes.filter(
        (p) =>
          (!query.roleCode || p.role?.code === query.roleCode) &&
          (!query.departmentId || p.department?.id === query.departmentId),
      );
      const ids = new Set(nodes.map((p) => p.id));
      return {
        companyId: i.company_id,
        initiativeId: iid,
        asOf: i.as_of,
        nodes,
        edges: all(
          "SELECT id,source_contact_id AS source,target_contact_id AS target,type,label,confirmed FROM relationships WHERE initiative_id=? ORDER BY id",
          iid,
        )
          .filter((e) => ids.has(e.source) && ids.has(e.target))
          .map((e) => ({ ...e, confirmed: !!e.confirmed })),
        filters: {
          departments: [
            ...new Map(
              allNodes
                .filter((p) => p.department)
                .map((p) => [p.department.id, p.department]),
            ).values(),
          ],
          roles: [
            ...new Map(
              allNodes.filter((p) => p.role).map((p) => [p.role.code, p.role]),
            ).values(),
          ],
        },
        matchingPeople: nodes.length,
      };
    },
    dossier: (iid, pid) => {
      const i = initiative(iid);
      return {
        companyId: i.company_id,
        initiativeId: iid,
        asOf: i.as_of,
        person: member(iid, pid),
        position: position(iid, pid),
      };
    },
    source: (iid, pid) => {
      member(iid, pid);
      const p = position(iid, pid);
      return { version: p?.version ?? 0, position: p, canEdit: true };
    },
    savePosition: (iid, pid, value) => {
      member(iid, pid);
      if (
        !Number.isInteger(value.expectedVersion) ||
        value.expectedVersion < 0 ||
        value.expectedVersion > 2147483646 ||
        !["SUPPORTS", "NEUTRAL", "DOUBTS", "OPPOSES"].includes(value.stance)
      )
        throw new HttpError(400, "Некорректная позиция.");
      const basis = text(value.basis, 1200, true);
      if ((position(iid, pid)?.version ?? 0) !== value.expectedVersion)
        throw new HttpError(409, "Версия изменилась.");
      run(
        "INSERT INTO stance_revisions (initiative_id,contact_id,version,stance,basis,changed_by) VALUES (?,?,?,?,?,?)",
        iid,
        pid,
        value.expectedVersion + 1,
        value.stance,
        basis,
        "local-demo",
      );
      const p = position(iid, pid);
      return { version: p.version, position: p, canEdit: true };
    },
    events,
    coverage,
    createEvent,
    importContacts,
  };
}
