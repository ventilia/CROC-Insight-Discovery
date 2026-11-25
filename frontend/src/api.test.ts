import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { apiWrite } from "./api.ts";

test("одновременные запросы получают общий CSRF-токен", async () => {
  const originalFetch = globalThis.fetch;
  const fetch = mock.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/v1/csrf") return Response.json({ headerName: "X-XSRF-TOKEN", token: "test-token" });
    assert.equal(new Headers(init?.headers).get("X-XSRF-TOKEN"), "test-token");
    return Response.json({ method: init?.method });
  });
  globalThis.fetch = fetch as typeof globalThis.fetch;
  try {
    const settings = await Promise.all([
      apiWrite("/initiatives/fixture/ai/advice", "POST", { question: "Кого проверить?" }),
      apiWrite("/initiatives/fixture/people/fixture/demo-source", "PATCH", { expectedVersion: 0 }),
    ]);
    assert.deepEqual(settings, [{ method: "POST" }, { method: "PATCH" }]);
    assert.equal(fetch.mock.calls.filter(({ arguments: [url] }) => url === "/api/v1/csrf").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
