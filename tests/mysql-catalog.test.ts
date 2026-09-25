import { afterEach, expect, test } from 'bun:test';
import { loadCatalog } from '../src/lib/catalog-feed.server';
import { __bridgeTest } from '../src/lib/mysql.server';
const originalFetch = globalThis.fetch;
const oldUrl = process.env.SUPABASE_URL;
const oldToken = process.env.SUPABASE_SERVICE_ROLE_KEY;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
  if (oldToken === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldToken;
});
test('catalog uses parameterized MySQL filters and converts MySQL booleans', async () => {
  process.env.SUPABASE_URL = 'https://bridge.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  __bridgeTest.setMeta({ boolCols: new Set(['active']), uniques: new Map() });
  let request: { q: string } | undefined;
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    request = JSON.parse(String(init?.body));
    return Response.json({ rows: [{ id: 'p',slug: 'test',name: 'Test',price_try:'250.00',retail_price_try:null,supplier_out_of_stock:'0',unlimited_stock:'0' }] });
  }) as typeof fetch;
  const items = await loadCatalog('https://example.com', { q: "' OR 1=1 --", limit: 9999 });
  expect(request?.q).toContain("active=true AND name ILIKE '%'' OR 1=1 --%'");
  expect(request?.q).toContain('LIMIT 250');
  expect(items[0].in_stock).toBe(true);
  expect(items[0].unlimited_stock).toBe(false);
  expect(items[0].price_try).toBe(250);
});
