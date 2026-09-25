import { afterEach, beforeEach, expect, test } from "bun:test";
import { __bridgeTest, isMysqlUnavailable, mysqlExec, mysqlQuery, parseRetryAfter } from "../src/lib/mysql.server";

const originalFetch = globalThis.fetch;
const oldUrl = process.env.SUPABASE_URL;
const oldToken = process.env.SUPABASE_SERVICE_ROLE_KEY;

beforeEach(() => {
  process.env.SUPABASE_URL = "https://bridge.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
  __bridgeTest.reset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  __bridgeTest.reset();
  if (oldUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = oldUrl;
  if (oldToken === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = oldToken;
});

test("classifies an HTML 429 before parsing and applies Retry-After globally", async () => {
  __bridgeTest.configure({ totalBudgetMs: 30, maxAttempts: 2, defaultThrottleMs: 1_000 });
  globalThis.fetch = (async () => new Response("<html>limited</html>", {
    status: 429,
    headers: { "Retry-After": "1", "Content-Type": "text/html" },
  })) as typeof fetch;

  const error = await mysqlQuery("SELECT 1").catch((caught: unknown) => caught);
  expect(isMysqlUnavailable(error)).toBe(true);
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
  const error = await mysqlQuery("SELECT 2").catch((caught: unknown) => caught);
  expect(isMysqlUnavailable(error)).toBe(true);
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

  const error = await mysqlExec("UPDATE wallets SET balance_try=balance_try-? WHERE user_id=?", [1, "u"]).catch(
    (caught: unknown) => caught,
  );
  expect(isMysqlUnavailable(error)).toBe(true);
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
