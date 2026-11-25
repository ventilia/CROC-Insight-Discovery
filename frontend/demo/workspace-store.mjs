import { randomUUID, createHash } from "node:crypto";

export function workspaceStore({
  db,
  all,
  get,
  run,
  initiative,
  member,
  HttpError,
}) {
  // Additive migrations keep existing SQLite profiles and history intact.
  for (const [table, columns] of Object.entries({
    contacts: { edit_version: "INTEGER NOT NULL DEFAULT 0" },
    initiatives: {
      stage: "TEXT",
      owner: "TEXT",
      due: "TEXT",
      next_step: "TEXT",
    },
    initiative_participants: {
      mandate: "TEXT",
      interest: "TEXT",
      source_label: "TEXT",
    },
    relationships: { source_label: "TEXT" },
  })) {
    const existing = new Set(
      all(`PRAGMA table_info(${table})`).map((c) => c.name),
    );
    for (const [name, type] of Object.entries(columns))
      if (!existing.has(name))
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS information_requests (
    id TEXT PRIMARY KEY, initiative_id TEXT NOT NULL REFERENCES initiatives(id), contact_id TEXT,
    recipient TEXT NOT NULL, question TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT', created_at TEXT NOT NULL,
    FOREIGN KEY(initiative_id,contact_id) REFERENCES initiative_participants(initiative_id,contact_id));`);
  const norm = (v) => (v ?? "").trim().toLocaleLowerCase("ru");
  const text = (v, max, required = false) => {
    if (v == null && !required) return null;
    if (typeof v !== "string" || v.length > max || (required && !v.trim()))
      throw new HttpError(400, "Проверьте обязательные поля и длину текста.");
    return v.trim() || null;
  };
  const tx = (action) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const departmentId = (cid, name) => {
    if (!name) return null;
    const found = all(
      "SELECT id,name FROM departments WHERE company_id=?",
      cid,
    ).find((d) => norm(d.name) === norm(name));
    if (found) return found.id;
    const id = randomUUID();
    run(
      "INSERT INTO departments(id,company_id,name) VALUES (?,?,?)",
      id,
      cid,
      name,
    );
    return id;
  };
  const roleCode = (label) => {
    if (!label) return null;
    const found = all("SELECT code,label FROM participant_roles").find(
      (r) => norm(r.label) === norm(label),
    );
    if (found) return found.code;
    const code =
      "CUSTOM_" +
      createHash("sha256")
        .update(norm(label))
        .digest("hex")
        .slice(0, 16)
        .toUpperCase();
    run(
      "INSERT OR IGNORE INTO participant_roles(code,label) VALUES (?,?)",
      code,
      label,
    );
    return code;
  };
  function createProject(cid, v) {
    if (!get("SELECT id FROM companies WHERE id=?", cid))
      throw new HttpError(404, "Компания недоступна.");
    const name = text(v.name, 200, true),
      stage = text(v.stage, 100),
      owner = text(v.owner, 200),
      due = text(v.due, 32),
      next = text(v.nextStep, 500);
    if (
      due &&
      (!/^\d{4}-\d\d-\d\d$/.test(due) ||
        !Number.isFinite(Date.parse(due)) ||
        new Date(due).toISOString().slice(0, 10) !== due)
    )
      throw new HttpError(400, "Проверьте срок проекта.");
    return tx(() => {
      if (
        all("SELECT name FROM initiatives WHERE company_id=?", cid).some(
          (p) => norm(p.name) === norm(name),
        )
      )
        throw new HttpError(409, "Проект с таким названием уже есть.");
      const id = randomUUID();
      run(
        "INSERT INTO initiatives(id,company_id,name,as_of,stage,owner,due,next_step) VALUES (?,?,?,?,?,?,?,?)",
        id,
        cid,
        name,
        new Date().toISOString(),
        stage,
        owner,
        due,
        next,
      );
      return { id };
    });
  }
  function saveParticipant(iid, pid, v) {
    const i = initiative(iid);
    if (pid) member(iid, pid);
    const name = text(v.name, 200, true),
      job = text(v.jobTitle, 300),
      dept = text(v.department, 160),
      email = text(v.email, 254),
      phone = text(v.phone, 60),
      role = text(v.roleLabel, 120),
      basis = text(v.influenceBasis, 500),
      mandate = text(v.mandate, 200),
      interest = text(v.interest, 500),
      source = text(v.sourceLabel, 300);
    const influence = v.influence || null;
    if (
      (influence && !["HIGH", "MEDIUM", "LOW"].includes(influence)) ||
      typeof v.decisionMaker !== "boolean"
    )
      throw new HttpError(400, "Проверьте влияние и признак ЛПР.");
    if (influence && !basis)
      throw new HttpError(400, "Укажите основание оценки влияния.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new HttpError(400, "Проверьте рабочий email.");
    if (
      pid &&
      (!Number.isSafeInteger(v.expectedVersion) || v.expectedVersion < 0)
    )
      throw new HttpError(400, "Проверьте версию записи.");
    return tx(() => {
      const existing = all(
        "SELECT id,email FROM contacts WHERE company_id=?",
        i.company_id,
      );
      if (
        email &&
        existing.some((p) => p.id !== pid && norm(p.email) === norm(email))
      )
        throw new HttpError(
          409,
          "Контакт с таким email уже существует. Используйте импорт или существующую карточку.",
        );
      const id = pid || randomUUID();
      if (pid) {
        const result = run(
          "UPDATE contacts SET name=?,job_title=?,department_id=?,email=?,phone=?,edit_version=edit_version+1 WHERE id=? AND edit_version=?",
          name,
          job,
          departmentId(i.company_id, dept),
          email,
          phone,
          pid,
          v.expectedVersion,
        );
        if (!result.changes)
          throw new HttpError(
            409,
            "Карточка уже изменилась. Обновите страницу перед редактированием.",
          );
      } else
        run(
          "INSERT INTO contacts(id,company_id,department_id,name,job_title,email,phone) VALUES (?,?,?,?,?,?,?)",
          id,
          i.company_id,
          departmentId(i.company_id, dept),
          name,
          job,
          email,
          phone,
        );
      run(
        `INSERT INTO initiative_participants(initiative_id,company_id,contact_id,role_code,decision_maker,influence,influence_basis,mandate,interest,source_label) VALUES (?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(initiative_id,contact_id) DO UPDATE SET role_code=excluded.role_code,decision_maker=excluded.decision_maker,influence=excluded.influence,influence_basis=excluded.influence_basis,mandate=excluded.mandate,interest=excluded.interest,source_label=excluded.source_label`,
        iid,
        i.company_id,
        id,
        roleCode(role),
        +v.decisionMaker,
        influence,
        basis,
        mandate,
        interest,
        source,
      );
      return { id };
    });
  }
  function createRelationship(iid, v) {
    initiative(iid);
    member(iid, v.source);
    member(iid, v.target);
    const type = text(v.type, 100, true),
      label = text(v.label, 300, true),
      source = text(v.sourceLabel, 500);
    if (
      !["APPROVAL", "COORDINATION", "EXPERTISE"].includes(type) ||
      v.source === v.target ||
      typeof v.confirmed !== "boolean"
    )
      throw new HttpError(
        400,
        "Выберите тип и двух разных участников проекта.",
      );
    if (v.confirmed && !source)
      throw new HttpError(400, "Для подтверждённой связи укажите основание.");
    return tx(() => {
      if (
        all(
          "SELECT label FROM relationships WHERE initiative_id=? AND source_contact_id=? AND target_contact_id=? AND type=?",
          iid,
          v.source,
          v.target,
          type,
        ).some((e) => norm(e.label) === norm(label))
      )
        throw new HttpError(409, "Такая связь уже есть в проекте.");
      const id = randomUUID();
      run(
        "INSERT INTO relationships(id,initiative_id,source_contact_id,target_contact_id,type,label,confirmed,source_label) VALUES (?,?,?,?,?,?,?,?)",
        id,
        iid,
        v.source,
        v.target,
        type,
        label,
        +v.confirmed,
        source,
      );
      return { id };
    });
  }
  function requests(iid) {
    initiative(iid);
    return all(
      "SELECT id,contact_id AS personId,recipient,question,status,created_at AS createdAt FROM information_requests WHERE initiative_id=? ORDER BY created_at DESC,id",
      iid,
    );
  }
  function createRequest(iid, v) {
    initiative(iid);
    const pid = v.personId || null;
    if (pid) member(iid, pid);
    const recipient = text(v.recipient, 200, true),
      question = text(v.question, 1000, true),
      id = randomUUID();
    run(
      "INSERT INTO information_requests(id,initiative_id,contact_id,recipient,question,created_at) VALUES (?,?,?,?,?,?)",
      id,
      iid,
      pid,
      recipient,
      question,
      new Date().toISOString(),
    );
    return { id };
  }
  function updateRequest(iid, id, v) {
    initiative(iid);
    if (!["DRAFT", "DONE"].includes(v.status))
      throw new HttpError(400, "Некорректный статус.");
    if (
      !run(
        "UPDATE information_requests SET status=? WHERE id=? AND initiative_id=?",
        v.status,
        id,
        iid,
      ).changes
    )
      throw new HttpError(404, "Запрос недоступен.");
    return { id };
  }
  return {
    createProject,
    saveParticipant,
    createRelationship,
    requests,
    createRequest,
    updateRequest,
  };
}
