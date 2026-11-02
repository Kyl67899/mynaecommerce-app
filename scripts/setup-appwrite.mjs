// One-time Appwrite provisioning for myna skin.
// Creates the database, tables, columns, indexes, the encrypted selfie bucket, and seeds products.
// Safe to re-run: anything that already exists is skipped.
//
// Fill in .env (and APPWRITE_API_KEY in .env or .env.setup), then run `npm run setup:appwrite`.
// Values typed on the command line override the file.
import { Client, TablesDB, Storage, Teams, Users, Permission, Role, Compression, TablesDBIndexType } from 'node-appwrite';
import { PRODUCTS } from './seed-products.mjs';
import { ensureAdminTeam, seedUsers } from './seed-users.mjs';
import { loadSettings, requireConnection } from './lib/env.mjs';

// Reads .env (the app's settings) and .env.setup (optional, script-only secrets).
// The project ID comes from the same EXPO_PUBLIC_APPWRITE_PROJECT_ID the app uses,
// so setup always provisions the project the app talks to.
const S = loadSettings();
requireConnection(S);
console.log(`Using ${S.loaded.join(' + ') || 'shell variables'} → project ${S.projectId}`);
const APPWRITE_ENDPOINT = S.endpoint;
const APPWRITE_PROJECT_ID = S.projectId;
const APPWRITE_API_KEY = S.apiKey;

const DB = S.dbId; // must match EXPO_PUBLIC_APPWRITE_DB_ID (default myna)
const BUCKET = S.bucketId;
const PRODUCT_IMAGES = 'product-images';
const ADMINS = Role.team('admins');

const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setKey(APPWRITE_API_KEY);
const tables = new TablesDB(client);
const storage = new Storage(client);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ok(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (e) {
    if (e?.code === 409) console.log(`  • ${label} (exists)`);
    else throw new Error(`${label}: ${e?.message ?? e}`);
  }
}

// Column helpers ------------------------------------------------------------
const col = {
  varchar: (key, size, required = false, extra = {}) => ({ kind: 'varchar', key, size, required, ...extra }),
  text: (key, required = false) => ({ kind: 'text', key, required }),
  int: (key, required = false, extra = {}) => ({ kind: 'int', key, required, ...extra }),
  float: (key, required = false) => ({ kind: 'float', key, required }),
  bool: (key, xdefault = false) => ({ kind: 'bool', key, required: false, xdefault }),
};

async function createColumn(tableId, c) {
  const base = { databaseId: DB, tableId, key: c.key, required: c.required };
  switch (c.kind) {
    case 'varchar':
      return tables.createVarcharColumn({ ...base, size: c.size, array: !!c.array });
    case 'text':
      return tables.createTextColumn(base);
    case 'int':
      return tables.createIntegerColumn({ ...base, min: c.min ?? null, max: c.max ?? null });
    case 'float':
      return tables.createFloatColumn(base);
    case 'bool':
      return tables.createBooleanColumn({ ...base, xdefault: c.xdefault });
  }
}

async function waitForColumns(tableId) {
  for (let i = 0; i < 60; i++) {
    const t = await tables.getTable({ databaseId: DB, tableId });
    const pending = (t.columns ?? []).filter((c) => c.status !== 'available');
    if (pending.length === 0) return;
    if (pending.some((c) => c.status === 'failed')) throw new Error(`Column failed on ${tableId}`);
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for columns on ${tableId}`);
}

// Schema -------------------------------------------------------------------
// rowSecurity=true means each row carries its own permissions (set by the server function),
// so one user can never read another user's scans, orders or profile.
const SCHEMA = [
  {
    id: 'products',
    name: 'Products',
    // Catalog is public; only members of the "admins" team can add, edit or remove products.
    permissions: [Permission.read(Role.any()), Permission.create(ADMINS), Permission.update(ADMINS), Permission.delete(ADMINS)],
    rowSecurity: false,
    columns: [
      col.varchar('name', 128, true),
      col.varchar('slug', 128, true),
      col.varchar('brand', 64),
      col.varchar('category', 32, true),
      col.text('description'),
      col.int('priceCents', true, { min: 0 }),
      col.int('compareAtCents', false, { min: 0 }),
      col.varchar('imageUrl', 512),
      col.float('rating'),
      col.int('stock', true, { min: 0 }),
      col.varchar('concerns', 32, false, { array: true }),
      col.varchar('skinTypes', 16, false, { array: true }), // normal | oily | dry | combination | sensitive
      col.bool('featured', false),
    ],
    indexes: [
      { key: 'name_search', type: TablesDBIndexType.Fulltext, columns: ['name'] },
      { key: 'by_category', type: TablesDBIndexType.Key, columns: ['category'] },
      { key: 'by_slug', type: TablesDBIndexType.Unique, columns: ['slug'] },
      { key: 'by_featured', type: TablesDBIndexType.Key, columns: ['featured'] },
    ],
  },
  {
    id: 'profiles',
    name: 'Profiles',
    permissions: [], // only the function writes; it grants the owner read on their row
    rowSecurity: true,
    columns: [col.varchar('userId', 36, true), col.text('wrappedDek', true), col.varchar('skinType', 32)],
    indexes: [{ key: 'by_user', type: TablesDBIndexType.Unique, columns: ['userId'] }],
  },
  {
    id: 'carts',
    name: 'Carts',
    permissions: [Permission.create(Role.users())], // a signed-in user may create their own cart row
    rowSecurity: true,
    columns: [col.text('items', true)],
    indexes: [],
  },
  {
    id: 'scans',
    name: 'Skin scans',
    permissions: [],
    rowSecurity: true,
    columns: [
      col.varchar('userId', 36, true),
      col.varchar('status', 16, true), // processing | complete | error
      col.varchar('fileId', 36),
      col.text('payloadEnc'), // AES-256-GCM ciphertext of the scores
      col.varchar('error', 256),
    ],
    indexes: [{ key: 'by_user', type: TablesDBIndexType.Key, columns: ['userId'] }],
  },
  {
    id: 'orders',
    name: 'Orders',
    // Shoppers read their own rows (row permissions); admins read every order and move its status.
    permissions: [Permission.read(ADMINS), Permission.update(ADMINS)],
    rowSecurity: true,
    columns: [
      col.varchar('userId', 36, true),
      col.varchar('status', 24, true), // placed | packed | shipped | delivered | cancelled
      col.text('itemsJson', true),
      col.int('subtotalCents', true, { min: 0 }),
      col.int('shippingCents', true, { min: 0 }),
      col.int('totalCents', true, { min: 0 }),
      col.text('shippingEnc', true), // AES-256-GCM ciphertext of the address
    ],
    indexes: [{ key: 'by_user', type: TablesDBIndexType.Key, columns: ['userId'] }],
  },
  {
    id: 'tickets',
    name: 'Support tickets',
    // Shoppers read their own tickets (row permission); the support team (admins) reads and updates all.
    permissions: [Permission.read(ADMINS), Permission.update(ADMINS)],
    rowSecurity: true,
    columns: [
      col.varchar('userId', 36, true),
      col.varchar('userName', 64),
      col.varchar('userEmail', 254),
      col.varchar('category', 24, true),
      col.varchar('priority', 12, true), // low | normal | high | urgent
      col.varchar('status', 12, true), // open | pending | resolved
      col.varchar('subject', 128),
      col.text('summary'),
      col.varchar('lastMessage', 256),
      col.varchar('assignee', 64),
    ],
    indexes: [
      { key: 'by_user', type: TablesDBIndexType.Key, columns: ['userId'] },
      { key: 'by_status', type: TablesDBIndexType.Key, columns: ['status'] },
    ],
  },
  {
    id: 'support_messages',
    name: 'Support chat messages',
    // Written only by the function. Shoppers read their own chat; admins read all (to see transcripts).
    permissions: [Permission.read(ADMINS)],
    rowSecurity: true,
    columns: [
      col.varchar('userId', 36, true),
      col.varchar('role', 12, true), // user | assistant | agent | system
      col.text('body', true),
      col.varchar('ticketId', 36),
      col.varchar('agentName', 64),
    ],
    indexes: [
      { key: 'by_user', type: TablesDBIndexType.Key, columns: ['userId'] },
      { key: 'by_ticket', type: TablesDBIndexType.Key, columns: ['ticketId'] },
    ],
  },
  {
    id: 'events',
    name: 'Analytics events',
    // Anonymized (no user ids). Written by the function, readable by admins only.
    permissions: [Permission.read(ADMINS)],
    rowSecurity: false,
    columns: [
      col.varchar('type', 24, true), // order_placed | scan_completed | signup
      col.varchar('day', 10, true), // YYYY-MM-DD (UTC)
      col.int('amountCents'),
      col.int('units'),
      col.text('dataJson'),
    ],
    indexes: [
      { key: 'by_day', type: TablesDBIndexType.Key, columns: ['day'] },
      { key: 'by_type', type: TablesDBIndexType.Key, columns: ['type'] },
    ],
  },
];

async function main() {
  console.log('Database');
  await ok(`database "${DB}"`, () => tables.create({ databaseId: DB, name: 'myna' }));
  await ensureAdminTeam(new Teams(client), ok);

  for (const t of SCHEMA) {
    console.log(`Table ${t.id}`);
    await ok('table', async () => {
      try {
        await tables.createTable({ databaseId: DB, tableId: t.id, name: t.name, permissions: t.permissions, rowSecurity: t.rowSecurity });
      } catch (e) {
        if (e?.code !== 409) throw e;
        // Already there (e.g. from an earlier run): bring its permissions up to date.
        await tables.updateTable({ databaseId: DB, tableId: t.id, name: t.name, permissions: t.permissions, rowSecurity: t.rowSecurity });
      }
    });
    for (const c of t.columns) await ok(`column ${c.key}`, () => createColumn(t.id, c));
    await waitForColumns(t.id);
    for (const ix of t.indexes)
      await ok(`index ${ix.key}`, () => tables.createIndex({ databaseId: DB, tableId: t.id, ...ix }));
  }

  console.log('Storage');
  await ok(`bucket "${BUCKET}" (AES-256 at rest, antivirus on)`, () =>
    storage.createBucket({
      bucketId: BUCKET,
      name: 'Skin scan selfies',
      permissions: [Permission.create(Role.users())],
      fileSecurity: true,
      enabled: true,
      maximumFileSize: 10 * 1024 * 1024,
      allowedFileExtensions: ['jpg', 'jpeg', 'png'],
      compression: Compression.None,
      encryption: true,
      antivirus: true,
    }),
  );

  await ok(`bucket "${PRODUCT_IMAGES}" (public product photos, admin upload)`, () =>
    storage.createBucket({
      bucketId: PRODUCT_IMAGES,
      name: 'Product images',
      permissions: [Permission.read(Role.any()), Permission.create(ADMINS), Permission.update(ADMINS), Permission.delete(ADMINS)],
      fileSecurity: false,
      enabled: true,
      maximumFileSize: 5 * 1024 * 1024,
      allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp'],
      compression: Compression.None,
      encryption: false,
      antivirus: true,
    }),
  );

  console.log('Seed products');
  // Wait a moment for indexes to finish building before writing rows.
  await sleep(2000);
  for (const p of PRODUCTS) {
    await ok(p.name, () => tables.createRow({ databaseId: DB, tableId: 'products', rowId: p.slug, data: p }));
  }
  console.log('Admin team and accounts');
  await seedUsers({ tables, teams: new Teams(client), users: new Users(client), DB, ok });

  console.log('\nDone. Next: deploy the function (see README → "Deploy the function").');
}

main().catch((e) => {
  console.error('\n✗', e.message);
  process.exit(1);
});