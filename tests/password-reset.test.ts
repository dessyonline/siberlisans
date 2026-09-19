import { afterEach, expect, test } from 'bun:test';
import { resetPasswordAtomically } from '../src/lib/password-reset.server';

const TOKEN = 'a'.repeat(64);
const originalFetch = globalThis.fetch;
const originalUrl = process.env.MYSQL_BRIDGE_URL;
const originalToken = process.env.MYSQL_BRIDGE_TOKEN;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.MYSQL_BRIDGE_URL;
  else process.env.MYSQL_BRIDGE_URL = originalUrl;
  if (originalToken === undefined) delete process.env.MYSQL_BRIDGE_TOKEN;
  else process.env.MYSQL_BRIDGE_TOKEN = originalToken;
});

function mockBridge(results: unknown[], status = 200) {
  process.env.MYSQL_BRIDGE_URL = 'https://bridge.invalid';
  process.env.MYSQL_BRIDGE_TOKEN = 'test-only';
  const calls: Record<string, unknown>[] = [];
  let index = 0;
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)));
    const body = results[Math.min(index++, results.length - 1)];
    return Response.json(body, { status: index === 1 ? status : 200 });
  }) as typeof fetch;
  return calls;
}

test('prefers the transactional bridge operation over general SQL', async () => {
  const calls = mockBridge([{ ok: true }]);
  expect(await resetPasswordAtomically(TOKEN, 'test-hash')).toBe(true);
  expect(calls).toEqual([{ operation: 'reset_password', token: TOKEN, passwordHash: 'test-hash' }]);
});

test('rejects consumed or expired token', async () => {
  mockBridge([{ ok: false }]);
  expect(await resetPasswordAtomically(TOKEN, 'test-hash')).toBe(false);
});

test('rejects malformed token without touching the database', async () => {
  const calls = mockBridge([{ ok: true }]);
  expect(await resetPasswordAtomically('short', 'test-hash')).toBe(false);
  expect(calls).toHaveLength(0);
});

test('accepts legacy 48-character links', async () => {
  const legacy = 'b'.repeat(48);
  mockBridge([{ ok: true }]);
  expect(await resetPasswordAtomically(legacy, 'test-hash')).toBe(true);
});

test('falls back to single-statement token claim on an old bridge', async () => {
  const calls = mockBridge([
    { error: 'Invalid payload: { sql: string, params?: any[] }' },
    { rowCount: 1 },
    { rows: [{ user_id: 'u1' }] },
    { rowCount: 1 },
  ], 400);
  expect(await resetPasswordAtomically(TOKEN, 'test-hash')).toBe(true);
  expect(String(calls[1]?.['sql'])).toContain('UPDATE auth_password_tokens SET used=1');
});

test('bridge failure does not leak database details', async () => {
  mockBridge([{ error: 'private database details' }], 500);
  await expect(resetPasswordAtomically(TOKEN, 'test-hash')).rejects.toThrow('Güvenli şifre işlemi kullanılamıyor');
});
