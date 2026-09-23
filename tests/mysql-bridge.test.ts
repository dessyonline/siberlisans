import { afterEach, beforeEach, expect, test } from "bun:test";
import { __bridgeTest, isMysqlUnavailable, mysqlExec, mysqlQuery, parseRetryAfter } from "../src/lib/mysql.server";

const originalFetch = globalThis.fetch;
const oldUrl = process.env.MYSQL_BRIDGE_URL;
const oldToken = process.env.MYSQL_BRIDGE_TOKEN;

beforeEach(() => {
  process.env.MYSQL_BRIDGE_URL = "https://bridge.invalid";
  process.env.MYSQL_BRIDGE_TOKEN = "test-only";
  __bridgeTest.reset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  __bridgeTest.reset();
  if (oldUrl === undefined) delete process.env.MYSQL_BRIDGE_URL;
  else process.env.MYSQL_BRIDGE_URL = oldUrl;
  if (oldToken === undefined) delete process.env.MYSQL_BRIDGE_TOKEN;
  else process.env.MYSQL_BRIDGE_TOKEN = oldToken;
});

test("classifies an HTML 429 before parsing and applies Retry-After globally", async () => {
  __bridgeTest.configure({ totalBudgetMs: 30, maxAttempts: 2, defaultThrottleMs: 5 });
  globalThis.fetch = (async () => new Response("<html>limited</html>", {
    status: 429,
    headers: { "Retry-After": "1", "Content-Type": "text/html" },
  })) as typeof fetch;

  await expect(mysqlQuery("SELECT 1")).rejects.toSatisfy(isMysqlUnavailable);
  expect(__bridgeTest.state().pausedUntil).toBeGreaterThan(Date.now() + 800);
});

test("supports HTTP-date Retry-After without shortening it", () => {
  const now = Date.now();
  const retryAt = new Date(now + 5_000).toUTCString();
  expect(parseRetryAfter(retryAt, now)).toBeGreaterThanOrEqual(4_000);
});

test("expired queued work never reaches the bridge", async () => {
  __bridgeTest.configure({ hardMax: 1, totalBudgetMs: 25, maxAttempts: 1 });
  let calls = 0;
  globalThis.fetch = (async (_input, init) => {
    calls++;
    if (calls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 60));
      if ((init?.signal as AbortSignal | undefined)?.aborted) throw new DOMException("Aborted", "AbortError");
    }
    return Response.json({ rows: [] });
  }) as typeof fetch;

  const first = mysqlQuery("SELECT 1").catch(() => []);
  await new Promise((resolve) => setTimeout(resolve, 2));
  await expect(mysqlQuery("SELECT 2")).rejects.toSatisfy(isMysqlUnavailable);
  await first;
  expect(calls).toBe(1);
  expect(__bridgeTest.state().active).toBe(0);
});

test("does not retry a write after an ambiguous network failure", async () => {
  __bridgeTest.configure({ totalBudgetMs: 100, maxAttempts: 4 });
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    throw new TypeError("network lost");
  }) as typeof fetch;

  await expect(mysqlExec("UPDATE wallets SET balance_try=balance_try-? WHERE user_id=?", [1, "u"])).rejects.toSatisfy(isMysqlUnavailable);
  expect(calls).toBe(1);
});

test("retries a read after an ambiguous network failure", async () => {
  __bridgeTest.configure({ totalBudgetMs: 1_000, maxAttempts: 2 });
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) throw new TypeError("network lost");
    return Response.json({ rows: [{ ok: 1 }] });
  }) as typeof fetch;

  expect(await mysqlQuery<{ ok: number }>("SELECT 1 AS ok")).toEqual([{ ok: 1 }]);
  expect(calls).toBe(2);
});