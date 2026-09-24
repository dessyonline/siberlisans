import { afterEach, beforeEach, expect, test } from 'bun:test';
import { resetPasswordAtomically } from '../src/lib/password-reset.server';
import { __bridgeTest } from '../src/lib/mysql.server';

const TOKEN = 'a'.repeat(64);
const originalFetch = globalThis.fetch;
const originalUrl = process.env.EXT_SUPABASE_URL;
const originalKey = process.env.EXT_SUPABASE_SERVICE_ROLE_KEY;
beforeEach(() => __bridgeTest.reset());
afterEach(() => {
  globalThis.fetch = originalFetch;
  __bridgeTest.reset();
  if (originalUrl === undefined) delete process.env.EXT_SUPABASE_URL;
  else process.env.EXT_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.EXT_SUPABASE_SERVICE_ROLE_KEY;
  else process.env.EXT_SUPABASE_SERVICE_ROLE_KEY = originalKey;
});

function mockDb(body: unknown, status = 200) {
  process.env.EXT_SUPABASE_URL = 'https://db.invalid';
  process.env.EXT_SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  const calls: string[] = [];
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    calls.push(String(JSON.parse(String(init?.body)).q));
    return Response.json(body, { status });
  }) as typeof fetch;
  return calls;
}

test('resets in a single atomic statement', async () => {
  const calls = mockDb({ rows: [{ n: 1 }] });
  expect(await resetPasswordAtomically(TOKEN, 'test-hash')).toBe(true);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toContain('UPDATE auth_password_tokens SET used=1');
  expect(calls[0]).toContain('DELETE FROM auth_sessions');
  expect(calls[0]).toContain(`'${TOKEN}'`);
});

test('rejects consumed or expired token', async () => {
  mockDb({ rows: [{ n: 0 }] });
  expect(await resetPasswordAtomically(TOKEN, 'test-hash')).toBe(false);
});

test('rejects malformed token without touching the database', async () => {
  const calls = mockDb({ rows: [{ n: 1 }] });
  expect(await resetPasswordAtomically('short', 'test-hash')).toBe(false);
  expect(calls).toHaveLength(0);
});

test('accepts legacy 48-character links', async () => {
  mockDb({ rows: [{ n: 1 }] });
  expect(await resetPasswordAtomically('b'.repeat(48), 'test-hash')).toBe(true);
});

test('database failure is reported as an error', async () => {
  mockDb({ message: 'private database details' }, 400);
  await expect(resetPasswordAtomically(TOKEN, 'test-hash')).rejects.toThrow();
});
