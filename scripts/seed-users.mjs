// Creates the "admins" team, an admin login, a test shopper login, and (optionally) demo data.
//
// Env (all optional):
//   ADMIN_EMAIL / ADMIN_PASSWORD   default admin@example.com / random strong password
//   TEST_EMAIL  / TEST_PASSWORD    default tester@example.com / random strong password
//   MASTER_KEK                     same value as the function's; lets us seed an encrypted scan + orders for the tester
//   SEED_DEMO_ANALYTICS=1          adds 30 days of sample analytics so the dashboard charts have shape
//
// Credentials are printed once and written to .credentials.local.txt (git-ignored).
import crypto from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { ID, Permission, Query, Role } from 'node-appwrite';
import { encrypt, randomKey, unwrapDek, wrapDek } from '../functions/myna-api/src/crypto.js';
import { orderEvent, scanEvent, signupEvent } from '../functions/myna-api/src/analytics.js';
import { PRODUCTS } from './seed-products.mjs';

export const ADMIN_TEAM = 'admins';
const strongPassword = () => crypto.randomBytes(12).toString('base64url') + '-Mn7';

export async function ensureAdminTeam(teams, ok) {
  await ok(`team "${ADMIN_TEAM}"`, () => teams.create({ teamId: ADMIN_TEAM, name: 'myna admins', roles: ['owner'] }));
}

async function ensureUser(users, { userId, email, password, name }) {
  try {
    await users.create({ userId, email, password, name });
    console.log(`  ✓ user ${email}`);
  } catch (e) {
    if (e?.code !== 409) throw e;
    // Exists already: reset the password so the printed credentials always work.
    await users.updatePassword({ userId, password });
    console.log(`  • user ${email} (exists, password reset)`);
  }
}

export async function seedUsers({ tables, teams, users, DB, ok }) {
  const admin = {
    userId: 'myna-admin',
    email: process.env.ADMIN_EMAIL || 'admin@example.com',
    password: process.env.ADMIN_PASSWORD || strongPassword(),
    name: 'myna Admin',
  };
  const tester = {
    userId: 'myna-tester',
    email: process.env.TEST_EMAIL || 'tester@example.com',
    password: process.env.TEST_PASSWORD || strongPassword(),
    name: 'Test Shopper',
  };

  await ensureUser(users, admin);
  await ensureUser(users, tester);
  // A real inbox you control can receive email OTP codes, so mark it verified.
  // (example.com addresses can't receive mail; those accounts use the authenticator app.)
  for (const [u, custom] of [[admin, process.env.ADMIN_EMAIL], [tester, process.env.TEST_EMAIL]]) {
    if (custom) await users.updateEmailVerification({ userId: u.userId, emailVerification: true }).catch(() => {});
  }
  await ok('admin added to team "admins"', () => teams.createMembership({ teamId: ADMIN_TEAM, roles: ['owner'], userId: admin.userId }));

  const creds = [
    'myna test logins (keep private; regenerate by re-running npm run setup:appwrite)',
    '',
    `ADMIN   ${admin.email}   ${admin.password}`,
    `SHOPPER ${tester.email}   ${tester.password}`,
    '',
    'First admin sign-in: the dashboard asks you to set up 2-step (authenticator app) before it opens.',
    '',
  ].join('\n');
  writeFileSync(new URL('../.credentials.local.txt', import.meta.url), creds);
  console.log('\n' + creds.replace(/^/gm, '  '));

  if (process.env.MASTER_KEK) await seedTesterData({ tables, DB, userId: tester.userId });
  else console.log('  • skipped demo scan/orders for the tester (set MASTER_KEK to seed them)');

  if (process.env.SEED_DEMO_ANALYTICS === '1') await seedDemoAnalytics({ tables, DB });
}

// One encrypted skin report and two orders, so the shopper dashboard isn't empty on first login.
async function seedTesterData({ tables, DB, userId }) {
  const kek = Buffer.from(process.env.MASTER_KEK, 'base64');
  let dek;
  try {
    const row = await tables.getRow({ databaseId: DB, tableId: 'profiles', rowId: userId });
    dek = unwrapDek(kek, row.wrappedDek, userId);
  } catch (e) {
    if (e?.code !== 404) throw e;
    dek = randomKey();
    await tables.createRow({
      databaseId: DB,
      tableId: 'profiles',
      rowId: userId,
      data: { userId, wrappedDek: wrapDek(kek, dek, userId) },
      permissions: [Permission.read(Role.user(userId))],
    });
  }

  const result = {
    mode: 'sd',
    overall: 71,
    skinAge: 27,
    skinType: { label: 'Combination & Redness-prone', base: 'combination', sensitive: true, source: 'youcam', zones: { t_zone: 'Oily', u_zone: 'Dry' } },
    concerns: [
      { key: 'redness', score: 54 },
      { key: 'pore', score: 61 },
      { key: 'dark_circle_v2', score: 63 },
      { key: 'moisture', score: 68 },
      { key: 'texture', score: 72 },
      { key: 'acne', score: 74 },
      { key: 'radiance', score: 76 },
      { key: 'oiliness', score: 78 },
      { key: 'wrinkle', score: 84 },
      { key: 'age_spot', score: 86 },
      { key: 'eye_bag', score: 88 },
      { key: 'firmness', score: 90 },
    ],
    analyzedAt: new Date().toISOString(),
  };
  const perms = (del) => [Permission.read(Role.user(userId)), ...(del ? [Permission.delete(Role.user(userId))] : [])];

  const existing = await tables.listRows({ databaseId: DB, tableId: 'scans', queries: [Query.equal('userId', userId), Query.limit(1)] }).catch(() => ({ total: 0 }));
  if (existing.total > 0) {
    console.log('  • tester demo data (exists)');
    return;
  }

  await tables.createRow({
    databaseId: DB,
    tableId: 'scans',
    rowId: ID.unique(),
    data: { userId, status: 'complete', payloadEnc: encrypt(dek, JSON.stringify(result), `scan:${userId}`) },
    permissions: perms(true),
  });
  await tables.createRow({ databaseId: DB, tableId: 'events', rowId: ID.unique(), data: scanEvent(result) });

  const address = { name: 'Test Shopper', line1: '100 Demo Street', line2: '', city: 'Tampa', state: 'FL', postalCode: '33602', country: 'US', phone: '' };
  const byId = Object.fromEntries(PRODUCTS.map((p) => [p.slug, p]));
  const orders = [
    { status: 'delivered', items: [['calm-cica-serum', 1], ['daily-shield-spf50', 1]] },
    { status: 'shipped', items: [['pore-refine-niacinamide', 1], ['bright-eye-caffeine', 1], ['deep-dew-hyaluronic', 1]] },
  ];
  for (const o of orders) {
    const lines = o.items.map(([slug, qty]) => ({ productId: slug, name: byId[slug].name, imageUrl: byId[slug].imageUrl, priceCents: byId[slug].priceCents, qty }));
    const subtotal = lines.reduce((s, l) => s + l.priceCents * l.qty, 0);
    const shipping = subtotal >= 5000 ? 0 : 595;
    await tables.createRow({
      databaseId: DB,
      tableId: 'orders',
      rowId: ID.unique(),
      data: {
        userId,
        status: o.status,
        itemsJson: JSON.stringify(lines),
        subtotalCents: subtotal,
        shippingCents: shipping,
        totalCents: subtotal + shipping,
        shippingEnc: encrypt(dek, JSON.stringify(address), `order:${userId}`),
      },
      permissions: perms(false),
    });
    await tables.createRow({ databaseId: DB, tableId: 'events', rowId: ID.unique(), data: orderEvent(lines, subtotal + shipping) });
  }
  console.log('  ✓ tester demo data: 1 encrypted skin report, 2 orders');
}

// Sample traffic for the last 30 days. Marked demo:true so it's easy to delete later.
async function seedDemoAnalytics({ tables, DB }) {
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const concernKeys = ['acne', 'redness', 'pore', 'texture', 'wrinkle', 'moisture', 'oiliness', 'radiance', 'age_spot', 'dark_circle_v2', 'eye_bag', 'firmness'];
  // Skew a few concerns lower so the "demand" chart tells a story.
  const bias = { redness: -14, pore: -10, dark_circle_v2: -12, moisture: -6 };
  let n = 0;
  for (let d = 29; d >= 0; d--) {
    const at = new Date(Date.now() - d * 86400000);
    const tag = (ev) => ({ ...ev, dataJson: JSON.stringify({ ...JSON.parse(ev.dataJson), demo: true }) });
    for (let i = 0; i < rand(1, 4); i++, n++) await tables.createRow({ databaseId: DB, tableId: 'events', rowId: ID.unique(), data: tag(signupEvent(at)) });
    for (let i = 0; i < rand(2, 7); i++, n++) {
      const concerns = concernKeys.map((k) => ({ key: k, score: Math.max(20, Math.min(98, rand(58, 92) + (bias[k] ?? 0))) }));
      const overall = Math.round(concerns.reduce((s, c) => s + c.score, 0) / concerns.length);
      const base = ['combination', 'combination', 'oily', 'oily', 'dry', 'normal'][rand(0, 5)];
      const skinType = { base, sensitive: Math.random() < 0.3 };
      await tables.createRow({ databaseId: DB, tableId: 'events', rowId: ID.unique(), data: tag(scanEvent({ overall, concerns, skinType }, at)) });
    }
    for (let i = 0; i < rand(1, 5); i++, n++) {
      const picks = [...PRODUCTS].sort(() => Math.random() - 0.5).slice(0, rand(1, 3));
      const lines = picks.map((p) => ({ productId: p.slug, name: p.name, priceCents: p.priceCents, qty: rand(1, 2) }));
      const subtotal = lines.reduce((s, l) => s + l.priceCents * l.qty, 0);
      await tables.createRow({ databaseId: DB, tableId: 'events', rowId: ID.unique(), data: tag(orderEvent(lines, subtotal + (subtotal >= 5000 ? 0 : 595), at)) });
    }
  }
  console.log(`  ✓ ${n} demo analytics events (marked demo:true)`);
}
