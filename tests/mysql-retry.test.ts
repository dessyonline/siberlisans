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
          headers: { "Retry-After": "1" } // 1 second
        });
      }
      return Response.json({ rows: [{ ok: 1 }] });
    }) as any;

    const start = Date.now();
    await mysqlQuery("SELECT 1");
    const duration = Date.now() - start;

    expect(callCount).toBe(2);
    expect(duration).toBeGreaterThanOrEqual(1000);
    expect(__bridgeTest.state().pausedUntil).toBeGreaterThan(start + 900);
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
    expect(__bridgeTest.state().limit).toBe(1); // Reduced from 2 to 1
  });

  test("enforces hard concurrency limit and queues requests", async () => {
    __bridgeTest.configure({ hardMax: 1 });
    let activeAtOnce = 0;
    let maxActive = 0;

    globalThis.fetch = (async () => {
      activeAtOnce++;
      maxActive = Math.max(maxActive, activeAtOnce);
      await new Promise(r => setTimeout(r, 50));
      activeAtOnce--;
      return Response.json({ rows: [] });
    }) as any;

    // Run 3 queries concurrently
    await Promise.all([
      mysqlQuery("SELECT 1"),
      mysqlQuery("SELECT 2"),
      mysqlQuery("SELECT 3")
    ]);

    expect(maxActive).toBe(1);
    expect(__bridgeTest.state().active).toBe(0);
    expect(__bridgeTest.state().queued).toBe(0);
  });

  test("respects total deadline and drops expired queued work", async () => {
    __bridgeTest.configure({ hardMax: 1, totalBudgetMs: 100 });
    
    globalThis.fetch = (async () => {
      await new Promise(r => setTimeout(r, 60));
      return Response.json({ rows: [] });
    }) as any;

    const p1 = mysqlQuery("SELECT 1"); // Takes 60ms
    const p2 = mysqlQuery("SELECT 2"); // Waits in queue, should expire

    await p1;
    try {
      await p2;
      expect.unreachable("p2 should have timed out");
    } catch (e: any) {
      expect(e.message).toContain("zaman aşımı");
    }
  });

  test("retries writes (INSERT) on 429 but NOT on 500", async () => {
    let callCount = 0;
    globalThis.fetch = (async (url, init: any) => {
      callCount++;
      const sql = JSON.parse(init.body).sql;
      if (callCount === 1) {
        return new Response("Error", { status: sql.includes("INSERT") ? 429 : 500 });
      }
      return Response.json({ rowCount: 1 });
    }) as any;

    // Test 429 on INSERT (Safe to retry because bridge didn't run it)
    __bridgeTest.configure({ defaultThrottleMs: 10 });
    const count = await mysqlExec("INSERT INTO t VALUES (1)");
    expect(count).toBe(1);
    expect(callCount).toBe(2);

    // Test 500 on INSERT (NOT safe to retry, could have side effects)
    callCount = 0;
    try {
      await mysqlExec("INSERT INTO t VALUES (2)");
      expect.unreachable("Should have thrown on 500");
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
    __bridgeTest.configure({ hardMax: 4 });
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
