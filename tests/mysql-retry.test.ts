import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { mysqlQuery, mysqlExec, __bridgeTest, isMysqlUnavailable } from "../src/lib/mysql.server";

const originalFetch = globalThis.fetch;

describe("MySQL Bridge Retry & Concurrency", () => {
  beforeEach(() => {
    __bridgeTest.reset();
    process.env.MYSQL_BRIDGE_URL = "https://bridge.test";
    process.env.MYSQL_BRIDGE_TOKEN = "test-token";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    __bridgeTest.reset();
  });

  test("respects Retry-After header (seconds) and pauses global bridge", async () => {
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount++;
      if (callCount === 1) {
        return new Response("Throttled", {
          status: 429,
          headers: { "Retry-After": "1" }
        });
      }
      return Response.json({ rows: [{ ok: 1 }] });
    }) as any;

    const start = Date.now();
    await mysqlQuery("SELECT 1");
    const duration = Date.now() - start;

    expect(callCount).toBe(2);
    expect(duration).toBeGreaterThanOrEqual(1000);
  });

  test("handles HTML/empty 429 responses safely", async () => {
    globalThis.fetch = (async () => {
      return new Response("<html>Too Many Requests</html>", {
        status: 429,
        headers: { "Content-Type": "text/html" }
      });
    }) as any;

    __bridgeTest.configure({ maxAttempts: 1 });
    try {
      await mysqlQuery("SELECT 1");
    } catch (e) {
      expect(isMysqlUnavailable(e)).toBe(true);
    }
    expect(__bridgeTest.state().limit).toBe(1);
  });

  test("enforces hard concurrency limit and queues requests", async () => {
    __bridgeTest.configure({ hardMax: 1 });
    let activeAtOnce = 0;
    let maxActive = 0;

    globalThis.fetch = (async () => {
      activeAtOnce++;
      maxActive = Math.max(maxActive, activeAtOnce);
      await new Promise(r => setTimeout(r, 20));
      activeAtOnce--;
      return Response.json({ rows: [] });
    }) as any;

    await Promise.all([
      mysqlQuery("SELECT 1"),
      mysqlQuery("SELECT 2"),
      mysqlQuery("SELECT 3")
    ]);

    expect(maxActive).toBe(1);
  });

  test("respects total deadline and drops expired queued work", async () => {
    // p1 takes 100ms. p2 waits and its total budget is 50ms.
    __bridgeTest.configure({ hardMax: 1, totalBudgetMs: 50 });
    
    let p1Started = false;
    globalThis.fetch = (async () => {
      p1Started = true;
      await new Promise(r => setTimeout(r, 100));
      return Response.json({ rows: [] });
    }) as any;

    const p1 = mysqlQuery("SELECT 1");
    // Wait until p1 has definitely started and is holding the lock
    while(!p1Started) await new Promise(r => setTimeout(r, 1));
    
    try {
      await mysqlQuery("SELECT 2");
      expect.unreachable("Should have timed out in queue");
    } catch (e: any) {
      expect(e.message).toContain("zaman aşımı");
    }
    await p1;
  });

  test("retries writes (INSERT) on 429", async () => {
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount++;
      if (callCount === 1) return new Response("Error", { status: 429 });
      return Response.json({ rowCount: 1 });
    }) as any;

    __bridgeTest.configure({ defaultThrottleMs: 1 });
    const count = await mysqlExec("INSERT INTO t VALUES (1)");
    expect(count).toBe(1);
    expect(callCount).toBe(2);
  });

  test("does NOT retry writes (INSERT) on 500", async () => {
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount++;
      return new Response("Error", { status: 500 });
    }) as any;

    __bridgeTest.configure({ maxAttempts: 2 });
    try {
      await mysqlExec("INSERT INTO t VALUES (2)");
      expect.unreachable("Should have thrown");
    } catch (e: any) {
      expect(e.message).toContain("500");
    }
    expect(callCount).toBe(1);
  });

  test("retries READs on 500", async () => {
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount++;
      if (callCount === 1) return new Response("Error", { status: 500 });
      return Response.json({ rows: [{ ok: 1 }] });
    }) as any;

    const rows = await mysqlQuery("SELECT 1");
    expect(rows[0].ok).toBe(1);
    expect(callCount).toBe(2);
  });
  
  test("adaptive limit increases after streak of successes", async () => {
    __bridgeTest.configure({ hardMax: 4, defaultThrottleMs: 1 });
    // First, force a reduction
    globalThis.fetch = (async () => new Response("429", { status: 429 })) as any;
    try { await mysqlQuery("SELECT 1"); } catch {}
    expect(__bridgeTest.state().limit).toBe(1);
    
    // Now simulate 20 successes
    globalThis.fetch = (async () => Response.json({ rows: [] })) as any;
    for (let i = 0; i < 20; i++) {
      await mysqlQuery("SELECT 1");
    }
    expect(__bridgeTest.state().limit).toBe(2);
  });
});

describe("parseRetryAfter date handling", () => {
  test("handles HTTP date in Retry-After", () => {
    const now = Date.now();
    const target = now + 5000;
    const dateStr = new Date(target).toUTCString();
    const { parseRetryAfter } = require("../src/lib/mysql.server");
    const wait = parseRetryAfter(dateStr, now);
    // Use a range to account for potential ms rounding in toUTCString
    expect(wait).toBeGreaterThan(4000);
    expect(wait).toBeLessThanOrEqual(5000);
  });
});
