import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

// Tables are ordered so every referenced parent is inserted first.
export const showcaseTables = [
  ["companies", "id name industry description", "id", "id", "92000001"],
  ["company_viewers", "viewer_key company_id", "viewer_key company_id", "company_id", "92000001"],
  ["departments", "id company_id name", "id", "company_id", "92000001"],
  ["contacts", "id company_id department_id name job_title verified_at email phone", "id", "company_id", "92000001"],
  ["initiatives", "id company_id name as_of stage owner due next_step", "id", "company_id", "92000001"],
  ["participant_roles", "code label", "code"],
  ["initiative_participants", "initiative_id company_id contact_id role_code decision_maker influence influence_basis mandate interest source_label", "initiative_id contact_id", "initiative_id", "92000002"],
  ["relationships", "id initiative_id source_contact_id target_contact_id type label confirmed source_label", "id", "initiative_id", "92000002"],
  ["touchpoints", "id initiative_id type occurred_at team subject outcome next_step source_label responsible_manager created_by request_fingerprint comment created_at", "id", "initiative_id", "92000002"],
  ["touchpoint_participants", "initiative_id touchpoint_id contact_id", "initiative_id touchpoint_id contact_id", "initiative_id", "92000002"],
  ["stance_revisions", "initiative_id contact_id version stance basis changed_by changed_at", "initiative_id contact_id version", "initiative_id", "92000002"],
];

const fixturePath = new URL("./showcase.json.gz", import.meta.url);

export function seedShowcase(db) {
  const version = "compact-showcase-v1";
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("CREATE TABLE IF NOT EXISTS demo_seeds (version TEXT PRIMARY KEY)");
    if (!db.prepare("SELECT 1 FROM demo_seeds WHERE version=?").get(version)) {
      const fixture = JSON.parse(gunzipSync(readFileSync(fixturePath)).toString("utf8"));
      for (const [table, columnList, keyList] of showcaseTables) {
        const columns = columnList.split(" ");
        const statement = db.prepare(
          `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")}) ON CONFLICT (${keyList.replaceAll(" ", ",")}) DO NOTHING`,
        );
        for (const row of fixture[table]) statement.run(...row);
      }
      db.prepare("INSERT INTO demo_seeds (version) VALUES (?)").run(version);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
