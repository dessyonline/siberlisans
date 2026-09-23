import { afterEach, beforeEach, expect, test } from "bun:test";
import { getUserByToken } from "../src/lib/auth.server";
import { __bridgeTest, isMysqlUnavailable } from "../src/lib/mysql.server";

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

test("missing or expired session is unauthenticated with one bridge call", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return Response.json({ rows: [] });
  }) as typeof fetch;

  expect(await getUserByToken("expired-token")).toBeNull();
  expect(calls).toBe(1);
});

test("valid session returns roles in the same bridge call", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return Response.json({
      rows: [{ id: "u1", email: "masked@example.invalid", display_name: "User", telegram_handle: null, roles_csv: "user,admin" }],
    });
  }) as typeof fetch;

  expect(await getUserByToken("valid-token")).toEqual({
    id: "u1",
    email: "masked@example.invalid",
    display_name: "User",
    telegram_handle: null,
    roles: ["user", "admin"],
  });
  expect(calls).toBe(1);
});

test("temporary bridge failure is not converted to unauthenticated", async () => {
  __bridgeTest.configure({ totalBudgetMs: 20, maxAttempts: 1 });
  globalThis.fetch = (async () => new Response("", { status: 429 })) as typeof fetch;

  const error = await getUserByToken("valid-token").catch((caught: unknown) => caught);
  expect(isMysqlUnavailable(error)).toBe(true);
});

test("coalesces simultaneous checks for the same session without sharing users", async () => {
  let calls = 0;
  globalThis.fetch = (async (_input, init) => {
    calls++;
    const payload = JSON.parse(String(init?.body)) as { params: string[] };
    await new Promise((resolve) => setTimeout(resolve, 5));
    return Response.json({
      rows: [{
        id: payload.params[0],
        email: `${payload.params[0]}@example.invalid`,
        display_name: "User",
        telegram_handle: null,
        roles_csv: "user",
      }],
    });
  }) as typeof fetch;

  const [first, duplicate, other] = await Promise.all([
    getUserByToken("coalesce-token"),
    getUserByToken("coalesce-token"),
    getUserByToken("other-token"),
  ]);

  expect(first?.id).toBe("coalesce-token");
  expect(duplicate?.id).toBe("coalesce-token");
  expect(other?.id).toBe("other-token");
  expect(calls).toBe(2);
});