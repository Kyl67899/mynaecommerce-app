// Checks that the app's settings and the Appwrite project agree.
//
//   npm run doctor
//
// It only READS. It never prints secret values, only whether they are set.
// Each ✗ line says what to do; fix them top to bottom and run it again.
import { Client, TablesDB, Storage, Teams, Functions, AppwriteException, Query } from 'node-appwrite';
import { loadSettings, projectMismatches } from './lib/env.mjs';

const S = loadSettings();
let bad = 0;
/* eslint-disable no-unused-expressions -- `cond ? ok() : no()` reads best for a checklist */
const ok = (m) => console.log(`  ✓ ${m}`);
const no = (m, fix) => {
  bad++;
  console.log(`  ✗ ${m}${fix ? `\n      → ${fix}` : ''}`);
};
const warn = (m) => console.log(`  ! ${m}`);

console.log(`\nmyna doctor — settings from ${S.loaded.join(' + ') || '(no .env files found)'}\n`);

// ── Local settings ───────────────────────────────────────────────────────────
console.log('Local settings');
S.endpoint ? ok(`endpoint ${S.endpoint}`) : no('EXPO_PUBLIC_APPWRITE_ENDPOINT is not set', 'cp .env.example .env, then fill it in');
S.appProjectId ? ok(`app project ${S.appProjectId}`) : no('EXPO_PUBLIC_APPWRITE_PROJECT_ID is not set', 'Console → Overview shows the project ID');
const mismatch = projectMismatches(S);
if (mismatch.length) {
  no('Project IDs do not match — the app and the scripts are talking to different Appwrite projects:');
  for (const [where, id] of mismatch) console.log(`        ${id}  ← ${where}`);
  console.log('      → Make them all the ID of the project you use in the Console.');
} else ok('app, scripts and appwrite.json agree on the project');
S.platform === 'com.myna.skin' ? ok('platform com.myna.skin') : warn(`platform is "${S.platform}" — Appwrite → Overview → Apps must list exactly this`);
S.apiKey ? ok('APPWRITE_API_KEY is set') : no('APPWRITE_API_KEY is not set (needed by the scripts only)', 'Add it to .env.setup');
if (!S.youcamKey) no('YOUCAM_API_KEY is not set', 'Add your YouCam key to .env.setup');
else if (/^standard_/.test(S.youcamKey)) no('YOUCAM_API_KEY starts with "standard_" — that is an Appwrite key, not a YouCam key', 'Use the key from the YouCam API console');
else ok('YOUCAM_API_KEY is set');
if (!S.masterKek) no('MASTER_KEK is not set', 'openssl rand -base64 32  → put it in .env.setup (keep it forever)');
else if (Buffer.from(S.masterKek, 'base64').length !== 32) no('MASTER_KEK is not 32 bytes of base64', 'openssl rand -base64 32');
else ok('MASTER_KEK is 32 bytes');
S.anthropicKey ? ok('ANTHROPIC_API_KEY is set') : warn('ANTHROPIC_API_KEY not set — support bot uses FAQ answers only');

if (!S.endpoint || !S.projectId || !S.apiKey) {
  console.log(`\n${bad} problem(s). Fix the settings above, then run npm run doctor again.\n`);
  process.exit(1);
}

// ── Appwrite project ─────────────────────────────────────────────────────────
const client = new Client().setEndpoint(S.endpoint).setProject(S.projectId).setKey(S.apiKey);
const tables = new TablesDB(client);
const storage = new Storage(client);
const teams = new Teams(client);
const functions = new Functions(client);

async function probe(label, fn, fix) {
  try {
    const r = await fn();
    ok(label);
    return r;
  } catch (e) {
    if (e instanceof AppwriteException && e.code === 401)
      no(`${label} — the API key isn't allowed to read this`, 'Give APPWRITE_API_KEY the scopes listed in .env.setup.example');
    else if (e instanceof AppwriteException && e.code === 404) no(`${label} — not found`, fix);
    else if (e?.cause?.code === 'ENOTFOUND' || /fetch failed/i.test(e?.message)) {
      no(`can't reach ${S.endpoint}`, 'Copy the endpoint exactly from Console → Overview (with /v1)');
      process.exit(1);
    } else no(`${label} — ${e.message}`, fix);
    return null;
  }
}

console.log(`\nAppwrite project ${S.projectId}`);
const setupFix = 'Run npm run setup:appwrite';
const db = await probe(`database "${S.dbId}"`, () => tables.get({ databaseId: S.dbId }), setupFix);
if (db) {
  const have = new Set((await tables.listTables({ databaseId: S.dbId })).tables.map((t) => t.$id));
  const need = ['products', 'profiles', 'carts', 'scans', 'orders', 'events', 'tickets', 'support_messages'];
  const missing = need.filter((t) => !have.has(t));
  missing.length ? no(`missing tables: ${missing.join(', ')}`, setupFix) : ok(`all ${need.length} tables`);

  // Products: are there any, and can a signed-out shopper read them the way the app does?
  if (have.has('products')) {
    const total = (await tables.listRows({ databaseId: S.dbId, tableId: 'products', queries: [Query.limit(1)] })).total;
    total ? ok(`${total} product(s) in the catalog`) : no('the products table is empty', 'Run npm run setup:appwrite (it seeds 12 starter products)');
    const guest = new TablesDB(new Client().setEndpoint(S.endpoint).setProject(S.projectId)); // no key = what the app sees
    try {
      const r = await guest.listRows({ databaseId: S.dbId, tableId: 'products', queries: [Query.limit(5), Query.orderDesc('rating')] });
      if (total) r.rows.length ? ok('shoppers can read products (same query the Shop tab runs)') : no('signed-out shoppers see 0 products', setupFix + ' to reset the table permissions');
    } catch (e) {
      if (e?.code === 401) no("shoppers aren't allowed to read products", setupFix + ' to reset the table permissions');
      else no(`the Shop tab's query fails: ${e.message}`, setupFix + ' to add any missing columns');
    }
  }
}
await probe(`bucket "${S.bucketId}"`, () => storage.getBucket({ bucketId: S.bucketId }), setupFix);
await probe('bucket "product-images"', () => storage.getBucket({ bucketId: 'product-images' }), setupFix);
await probe('team "admins"', () => teams.get({ teamId: 'admins' }), setupFix);

console.log(`\nFunction "${S.functionId}" (runs the skin scan, checkout and support)`);
const deployFix = 'Run npm run deploy:function';
const fn = await probe('function exists', () => functions.get({ functionId: S.functionId }), deployFix);
if (fn) {
  fn.execute?.includes('users') ? ok('signed-in users can run it') : no(`execute is [${fn.execute}] — signed-in users can't run it`, deployFix);
  fn.enabled ? ok('enabled') : no('function is disabled', deployFix);
  fn.timeout >= 120 ? ok(`timeout ${fn.timeout}s`) : no(`timeout is ${fn.timeout}s; scans need 120s`, deployFix);
  if (!fn.deploymentId) no('no active deployment (code was never uploaded or never finished building)', deployFix);
  else {
    const d = await functions.getDeployment({ functionId: S.functionId, deploymentId: fn.deploymentId });
    d.status === 'ready' ? ok('active deployment is ready') : no(`active deployment is "${d.status}"`, deployFix);
  }
  const keys = new Set((await functions.listVariables({ functionId: S.functionId })).variables.map((v) => v.key));
  const needVars = ['YOUCAM_API_KEY', 'MASTER_KEK'];
  const missingVars = needVars.filter((k) => !keys.has(k));
  missingVars.length ? no(`function variables missing: ${missingVars.join(', ')}`, deployFix) : ok('YOUCAM_API_KEY and MASTER_KEK are set on the function');
  const dbVar = keys.has('DB_ID') ? null : S.dbId !== 'myna' ? 'DB_ID' : null;
  if (dbVar) no(`the function would use database "myna" but the app uses "${S.dbId}"`, deployFix);
}

console.log(bad ? `\n${bad} problem(s) found. Fix them top to bottom, then run npm run doctor again.\n` : '\n✓ Everything checks out.\n');
process.exit(bad ? 1 : 0);
