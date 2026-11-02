// Admin analytics math + admin/test account seeding (with fake Appwrite services).
//   node --test scripts/admin.test.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { test } from 'node:test';

const { computeMetrics, reach, scanSamples, lastDays } = await import('../src/lib/analytics.ts');
const { orderEvent, scanEvent, signupEvent } = await import('../functions/myna-api/src/analytics.js');
const { seedUsers } = await import('./seed-users.mjs');
const { decrypt, unwrapDek } = await import('../functions/myna-api/src/crypto.js');

const now = new Date('2026-10-28T12:00:00Z');
const daysAgo = (n) => new Date(now.getTime() - n * 86400000);
const asRow = (ev, i) => ({ $id: `e${i}`, ...ev });
const scan = (scores, at) => scanEvent({ overall: Math.round(Object.values(scores).reduce((a, b) => a + b) / Object.keys(scores).length), concerns: Object.entries(scores).map(([key, score]) => ({ key, score })) }, at);

const products = [
  { $id: 'cica', name: 'Calm Cica', stock: 5, concerns: ['redness'], priceCents: 3600 },
  { $id: 'spf', name: 'SPF', stock: 0, concerns: ['redness', 'age_spot'], priceCents: 3000 },
  { $id: 'gel', name: 'Gel', stock: 40, concerns: ['moisture'], priceCents: 2000 },
];

const events = [
  orderEvent([{ productId: 'cica', name: 'Calm Cica', qty: 2, priceCents: 3600 }], 7200, daysAgo(1)),
  orderEvent([{ productId: 'gel', name: 'Gel', qty: 1, priceCents: 2000 }], 2595, daysAgo(2)),
  orderEvent([{ productId: 'gel', name: 'Gel', qty: 1, priceCents: 2000 }], 2595, daysAgo(9)), // previous period
  scan({ redness: 50, moisture: 80 }, daysAgo(0)),
  scan({ redness: 60, moisture: 65 }, daysAgo(3)),
  scan({ redness: 90, moisture: 90 }, daysAgo(4)),
  scan({ redness: 40, moisture: 90 }, daysAgo(5)),
  signupEvent(daysAgo(1)),
  signupEvent(daysAgo(6)),
].map(asRow);

test('KPIs, deltas and daily series for a 7-day window', () => {
  const m = computeMetrics(events, products, 7, now);
  assert.equal(m.revenueCents, 9795);
  assert.equal(m.orders, 2);
  assert.equal(m.aovCents, 4898);
  assert.equal(m.units, 3);
  assert.equal(m.scans, 4);
  assert.equal(m.signups, 2);
  assert.equal(m.deltas.orders, 1); // 2 vs 1 → +100%
  assert.equal(m.daily.length, 7);
  assert.equal(m.daily.at(-1).day, '2026-10-28');
  assert.equal(m.daily.reduce((s, d) => s + d.revenueCents, 0), 9795);
});

test('top products and low stock', () => {
  const m = computeMetrics(events, products, 7, now);
  assert.deepEqual(m.topProducts.map((p) => [p.productId, p.units]), [['cica', 2], ['gel', 1]]);
  assert.deepEqual(m.lowStock.map((p) => p.$id), ['spf', 'cica']);
});

test('concern demand flags gaps where customers struggle and the shelf is thin', () => {
  const m = computeMetrics(events, products, 7, now);
  const redness = m.concernDemand.find((c) => c.key === 'redness');
  assert.equal(redness.focusShare, 0.75); // 3 of 4 scans < 70
  assert.equal(redness.coverage, 1); // spf is sold out, so only cica counts
  assert.equal(redness.gap, true);
  assert.equal(m.concernDemand[0].key, 'redness'); // sorted by need
  const moisture = m.concernDemand.find((c) => c.key === 'moisture');
  assert.equal(moisture.focusShare, 0.25);
});

test('reach = share of scans a product tagged with those concerns would be recommended to', () => {
  const samples = scanSamples(events);
  assert.equal(reach(['redness'], samples), 0.75);
  assert.equal(reach(['redness', 'moisture'], samples), 0.75);
  assert.equal(reach(['moisture'], samples), 0.25);
  assert.equal(reach([], samples), 0);
});

test('lastDays ends today and is contiguous', () => {
  assert.deepEqual(lastDays(3, now), ['2026-10-26', '2026-10-27', '2026-10-28']);
});

test('analytics events carry no personal data', () => {
  for (const e of events) {
    const s = JSON.stringify(e);
    assert.ok(!/userId|email|address|line1/.test(s), s);
  }
});

test('seedUsers creates admin + tester, adds admin to team, writes creds, seeds encrypted tester data', async () => {
  const kek = crypto.randomBytes(32);
  process.env.MASTER_KEK = kek.toString('base64');
  delete process.env.SEED_DEMO_ANALYTICS;
  const created = { users: [], memberships: [], rows: [] };
  const users = {
    create: async (p) => created.users.push(p),
    updatePassword: async () => {},
    updateEmailVerification: async () => {},
  };
  const teams = { createMembership: async (p) => created.memberships.push(p) };
  const store = new Map();
  const tables = {
    getRow: async ({ tableId, rowId }) => {
      const r = store.get(`${tableId}/${rowId}`);
      if (!r) throw Object.assign(new Error('nf'), { code: 404 });
      return r;
    },
    listRows: async () => ({ total: 0, rows: [] }),
    createRow: async ({ tableId, rowId, data, permissions }) => {
      store.set(`${tableId}/${rowId}`, data);
      created.rows.push({ tableId, data, permissions });
    },
  };
  const ok = async (_l, fn) => fn();
  const credsFile = new URL('../.credentials.local.txt', import.meta.url);
  const had = existsSync(credsFile) ? readFileSync(credsFile) : null;

  await seedUsers({ tables, teams, users, DB: 'myna', ok });

  assert.deepEqual(created.users.map((u) => u.email), ['admin@example.com', 'tester@example.com']);
  assert.ok(created.users.every((u) => u.password.length >= 16));
  assert.deepEqual(created.memberships, [{ teamId: 'admins', roles: ['owner'], userId: 'myna-admin' }]);
  const creds = readFileSync(credsFile, 'utf8');
  assert.match(creds, /ADMIN\s+admin@example\.com/);
  assert.match(creds, /SHOPPER\s+tester@example\.com/);

  const byTable = (t) => created.rows.filter((r) => r.tableId === t);
  assert.equal(byTable('scans').length, 1);
  assert.equal(byTable('orders').length, 2);
  assert.equal(byTable('events').length, 3);
  // Tester can read their own rows and nobody else's
  assert.ok(byTable('orders').every((r) => r.permissions.includes('read("user:myna-tester")') && r.permissions.length === 1));
  // Seeded scan really is encrypted with the tester's key
  const dek = unwrapDek(kek, store.get('profiles/myna-tester').wrappedDek, 'myna-tester');
  const result = JSON.parse(decrypt(dek, byTable('scans')[0].data.payloadEnc, 'scan:myna-tester').toString());
  assert.equal(result.overall, 71);

  if (had) {
    // restore any real local credentials file
    (await import('node:fs')).writeFileSync(credsFile, had);
  } else rmSync(credsFile);
});
