import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, extname, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore, HttpError } from "./store.mjs";

export function startServer({
  port = 5173,
  filename,
  staticDir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist"),
} = {}) {
  const data =
    process.env.CROC_DEMO_DATA_DIR ||
    resolve(dirname(fileURLToPath(import.meta.url)), "../.data");
  if (!filename) {
    mkdirSync(data, { recursive: true });
    filename = resolve(data, "kit.sqlite");
  }
  const store = createStore(filename);
  const json = (res, status, value) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(value));
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const path = url.pathname;
      const parts = path.split("/").filter(Boolean).slice(2);
      if (!path.startsWith("/api/")) {
        if (req.method !== "GET" && req.method !== "HEAD")
          throw new HttpError(405, "Метод недоступен.");
        const file = resolve(
          staticDir,
          "." + decodeURIComponent(path === "/" ? "/index.html" : path),
        );
        if (!file.startsWith(resolve(staticDir) + sep) || !existsSync(file))
          throw new HttpError(404, "Файл недоступен.");
        res.writeHead(200, {
          "Content-Type":
            {
              ".html": "text/html; charset=utf-8",
              ".js": "text/javascript; charset=utf-8",
              ".css": "text/css; charset=utf-8",
              ".woff2": "font/woff2",
              ".svg": "image/svg+xml",
            }[extname(file)] || "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
        });
        return res.end(req.method === "HEAD" ? undefined : readFileSync(file));
      }
      if (!path.startsWith("/api/v1/"))
        throw new HttpError(404, "Маршрут недоступен.");
      if (req.method === "GET") {
        if (parts[0] === "csrf") {
          const token = randomBytes(24).toString("hex");
          res.setHeader(
            "Set-Cookie",
            `KIT_CSRF=${token}; HttpOnly; SameSite=Strict; Path=/`,
          );
          return json(res, 200, { headerName: "X-KIT-CSRF", token });
        }
        if (path === "/api/v1/capabilities")
          return json(res, 200, {
            mode: "demo",
            canCreateEvents: true,
            canImportContacts: true,
          });
        if (path === "/api/v1/ai/settings")
          return json(res, 200, { enabled: false, model: null });
        if (path === "/api/v1/companies")
          return json(res, 200, store.companies());
        if (
          parts[0] === "companies" &&
          parts.length === 3 &&
          parts[2] === "initiatives"
        )
          return json(res, 200, store.initiatives(parts[1]));
        if (parts[0] === "initiatives") {
          const iid = parts[1],
            q = Object.fromEntries(url.searchParams);
          if (parts.length === 3 && parts[2] === "graph")
            return json(res, 200, store.graph(iid, q));
          if (parts.length === 3 && parts[2] === "coverage")
            return json(res, 200, store.coverage(iid, q.days));
          if (parts.length === 3 && parts[2] === "events")
            return json(res, 200, store.events(iid, q));
          if (parts[2] === "people" && parts.length === 4)
            return json(res, 200, store.dossier(iid, parts[3]));
          if (
            parts[2] === "people" &&
            parts[4] === "demo-source" &&
            parts.length === 5
          )
            return json(res, 200, store.source(iid, parts[3]));
        }
      } else if (req.method === "POST" || req.method === "PATCH") {
        const cookie = req.headers.cookie?.match(
          /(?:^|; )KIT_CSRF=([a-f0-9]{48})(?:;|$)/,
        )?.[1];
        const origin = req.headers.origin;
        const allowed = new Set([
          `http://127.0.0.1:${server.address().port}`,
          `http://localhost:${server.address().port}`,
        ]);
        if (
          !cookie ||
          req.headers["x-kit-csrf"] !== cookie ||
          (origin && !allowed.has(origin))
        )
          throw new HttpError(403, "Обновите страницу перед сохранением.");
        if (!req.headers["content-type"]?.startsWith("application/json"))
          throw new HttpError(415, "Ожидается JSON.");
        const chunks = [];
        let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > (parts[2] === "imports" ? 512000 : 32768))
            throw new HttpError(413, "Слишком большой запрос.");
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks).toString("utf8");
        let value;
        try {
          value = JSON.parse(body);
        } catch {
          throw new HttpError(400, "Некорректный JSON.");
        }
        if (!value || Array.isArray(value) || typeof value !== "object")
          throw new HttpError(400, "Ожидается объект.");
        if (
          req.method === "POST" &&
          parts[0] === "initiatives" &&
          parts[2] === "imports" &&
          parts[3] === "contacts" &&
          parts.length === 4
        )
          return json(res, 201, store.importContacts(parts[1], value));
        if (
          req.method === "POST" &&
          parts[0] === "initiatives" &&
          parts[2] === "events" &&
          parts.length === 3
        )
          return json(res, 201, store.createEvent(parts[1], value));
        if (
          req.method === "PATCH" &&
          parts[0] === "initiatives" &&
          parts[2] === "people" &&
          parts[4] === "demo-source" &&
          parts.length === 5
        )
          return json(res, 200, store.savePosition(parts[1], parts[3], value));
      }
      throw new HttpError(404, "Маршрут недоступен.");
    } catch (error) {
      if (!(error instanceof HttpError)) console.error(error);
      json(res, error.status ?? 500, {
        detail:
          error instanceof HttpError
            ? error.message
            : "Не удалось обработать запрос.",
      });
    }
  });
  server.on("close", () => store.close());
  server.listen(port, "127.0.0.1");
  return server;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = startServer({ port: Number(process.env.PORT || 5173) });
  server.on("listening", () =>
    console.log(
      `KIT · демоданные, SQLite · http://127.0.0.1:${server.address().port}`,
    ),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => server.close(() => process.exit(0)));
}
