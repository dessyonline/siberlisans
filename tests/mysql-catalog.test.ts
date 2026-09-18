import { afterEach, expect, test } from 'bun:test';
import { loadCatalog } from '../src/lib/catalog-feed.server';
const originalFetch = globalThis.fetch;
const oldUrl = process.env.MYSQL_BRIDGE_URL;
const oldToken = process.env.MYSQL_BRIDGE_TOKEN;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (oldUrl === undefined) delete process.env.MYSQL_BRIDGE_URL; else process.env.MYSQL_BRIDGE_URL = oldUrl;
  if (oldToken === undefined) delete process.env.MYSQL_BRIDGE_TOKEN; else process.env.MYSQL_BRIDGE_TOKEN = oldToken;
});
test('catalog uses parameterized MySQL filters and converts MySQL booleans', async () => {
  process.env.MYSQL_BRIDGE_URL = 'https://bridge.invalid';
  process.env.MYSQL_BRIDGE_TOKEN = 'test-only';
  let request: { sql: string; params: unknown[] } | undefined;
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    request = JSON.parse(String(init?.body));
    return Response.json({ rows: [{ id: 'p',slug: 'test',name: 'Test',price_try:'250.00',retail_price_try:null,supplier_out_of_stock:'0',unlimited_stock:'0' }] });
  }) as typeof fetch;
  const items = await loadCatalog('https://example.com', { q: "' OR 1=1 --", limit: 9999 });
  expect(request?.sql).toContain('active=1 AND name LIKE ?');
  expect(request?.sql).toContain('LIMIT 250');
  expect(request?.sql).not.toContain("' OR 1=1");
  expect(request?.params).toEqual(["%' OR 1=1 --%"]);
  expect(items[0].in_stock).toBe(true);
  expect(items[0].unlimited_stock).toBe(false);
  expect(items[0].price_try).toBe(250);
});
