import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { showcaseTables } from "./showcase-seed.mjs";

const backend = new URL("../../backend/", import.meta.url);
const database = `croc_showcase_export_${randomUUID().replaceAll("-", "")}`;
const sql = (path) => readFileSync(new URL(path, backend), "utf8");
const sqlFiles = (directory) =>
  readdirSync(new URL(directory, backend))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => sql(directory + name));

function postgres(args, input) {
  const result = spawnSync(
    "docker",
    ["compose", "exec", "-T", "postgres", ...args],
    { cwd: fileURLToPath(backend), input, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `Docker exited with ${result.status}`);
  return result.stdout;
}

const psql = (user, input) =>
  postgres(["psql", "-XqAt", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", database], input);

const timestamps = new Set(["as_of", "verified_at", "occurred_at", "created_at", "changed_at"]);
const integers = new Set(["decision_maker", "confirmed"]);

postgres(["createdb", "-U", "postgres", "-O", "croc_migrator", database]);
try {
  psql("postgres", "CREATE SCHEMA insight AUTHORIZATION croc_migrator; GRANT USAGE ON SCHEMA insight TO croc_reader;");
  psql("croc_migrator", [
    "SET search_path TO insight, pg_catalog;",
    ...sqlFiles("src/main/resources/db/migration/"),
    ...sqlFiles("src/main/resources/db/demo/"),
    ...["load", "enrich", "compact"].map((step) => sql(`docker/postgres/${step}-demo-showcase.sql`)),
  ].join("\n"));
  const snapshot = Object.fromEntries(showcaseTables.map(([table, columnList, keyList, scopeColumn, prefix]) => {
    const columns = columnList.split(" ").map((column) => {
      if (timestamps.has(column))
        return `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
      if (integers.has(column)) return `${column}::integer`;
      return column;
    });
    const scope = scopeColumn ? `WHERE ${scopeColumn}::text LIKE '${prefix}-%'` : "";
    const order = keyList.split(" ").join(", ");
    const data = psql("croc_reader", `
      SELECT coalesce(json_agg(json_build_array(${columns.join(", ")}) ORDER BY ${order}), '[]'::json)
      FROM insight.${table} ${scope};
    `);
    return [table, JSON.parse(data)];
  }));
  writeFileSync(new URL("./showcase.json.gz", import.meta.url), gzipSync(JSON.stringify(snapshot)));
} finally {
  postgres(["dropdb", "-U", "postgres", database]);
}
