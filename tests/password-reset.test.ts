import { afterEach, expect, test } from 'bun:test';
import { resetPasswordAtomically } from '../src/lib/password-reset.server';

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

function mockBridge(result: unknown, status = 200) {
  process.env.MYSQL_BRIDGE_URL = 'https://bridge.invalid';
  process.env.MYSQL_BRIDGE_TOKEN = 'test-only';
  const calls: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)));
    return Response.json(result, { status });
  }) as typeof fetch;
  return calls;
}

test('uses exactly one named operation, not general SQL', async () => {
  const calls = mockBridge({ ok: true });
  expect(await resetPasswordAtomically('test-token', 'test-hash')).toBe(true);
  expect(calls).toEqual([{ operation: 'reset_password', token: 'test-token', passwordHash: 'test-hash' }]);
});
test('rejects consumed or expired token', async () => {
  mockBridge({ ok: false });
  expect(await resetPasswordAtomically('test-token', 'test-hash')).toBe(false);
});
test('old bridge cannot report success or trigger unsafe fallback', async () => {
  const calls = mockBridge({ rows: [] });
  await expect(resetPasswordAtomically('test-token', 'test-hash')).rejects.toThrow();
  expect(calls).toHaveLength(1);
});
test('bridge failure does not leak database details', async () => {
  mockBridge({ error: 'private database details' }, 500);
  await expect(resetPasswordAtomically('test-token', 'test-hash')).rejects.toThrow('Güvenli şifre işlemi kullanılamıyor');
});