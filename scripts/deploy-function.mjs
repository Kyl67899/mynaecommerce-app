// Creates (or updates) the myna-api Appwrite Function, copies its secrets in,
// uploads the code and waits until the deployment is live.
//
//   npm run deploy:function
//
// Fixes "Function with the requested ID could not be found" — that message means
// the app's Appwrite project has no function called myna-api (or it never finished deploying).
// Settings come from .env + .env.setup (see scripts/lib/env.mjs). Safe to re-run.
import { Client, Functions, Runtime, AppwriteException } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, loadSettings, requireConnection } from './lib/env.mjs';

const S = loadSettings();
requireConnection(S);

const spec = JSON.parse(readFileSync(join(ROOT, 'appwrite.json'), 'utf8')).functions.find((f) => f.$id === 'myna-api');
if (!spec) throw new Error('appwrite.json has no myna-api function');
const FN = S.functionId;
// Event triggers name the database, so keep them in step with EXPO_PUBLIC_APPWRITE_DB_ID.
const events = spec.events.map((e) => e.replace(/^tablesdb\.[^.]+\./, `tablesdb.${S.dbId}.`));

const client = new Client().setEndpoint(S.endpoint).setProject(S.projectId).setKey(S.apiKey);
const functions = new Functions(client);

const step = (msg) => console.log(`• ${msg}`);
const fail = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

// ── 1. Secrets check before touching anything ────────────────────────────────
const problems = [];
if (!S.youcamKey) problems.push('YOUCAM_API_KEY is missing (put it in .env.setup).');
else if (/^standard_/.test(S.youcamKey))
  problems.push('YOUCAM_API_KEY starts with "standard_" — that is an Appwrite API key, not a YouCam key. Get the key from the YouCam API console.');
if (!S.masterKek) problems.push('MASTER_KEK is missing. Generate it once with: openssl rand -base64 32');
else if (Buffer.from(S.masterKek, 'base64').length !== 32) problems.push('MASTER_KEK must be 32 bytes, base64-encoded (openssl rand -base64 32).');
if (problems.length) fail(problems.join('\n  '));

console.log(`\nDeploying "${FN}" to project ${S.projectId} (${S.endpoint})\n`);

// ── 2. Create or update the function ─────────────────────────────────────────
const settings = {
  functionId: FN,
  name: spec.name,
  runtime: Runtime.Node22,
  execute: spec.execute,
  events,
  schedule: spec.schedule || '',
  timeout: spec.timeout,
  enabled: true,
  logging: true,
  entrypoint: spec.entrypoint,
  commands: spec.commands,
  scopes: spec.scopes,
};
try {
  await functions.get({ functionId: FN });
  await functions.update(settings);
  step(`updated function settings (execute: ${spec.execute.join(', ')}, timeout ${spec.timeout}s)`);
} catch (e) {
  if (e instanceof AppwriteException && e.code === 401) fail('The API key was rejected. Check APPWRITE_API_KEY and give it functions.read + functions.write scopes.');
  if (!(e instanceof AppwriteException) || e.code !== 404) throw e;
  await functions.create(settings);
  step('created function');
}

// ── 3. Environment variables (secret = hidden in the Console) ───────────────
const vars = {
  YOUCAM_API_KEY: [S.youcamKey, true],
  MASTER_KEK: [S.masterKek, true],
  DB_ID: [S.dbId, false],
  SCANS_BUCKET_ID: [S.bucketId, false],
};
if (S.anthropicKey) vars.ANTHROPIC_API_KEY = [S.anthropicKey, true];
if (process.env.YOUCAM_BASE_URL?.trim()) vars.YOUCAM_BASE_URL = [process.env.YOUCAM_BASE_URL.trim(), false];
if (process.env.PRODUCT_IMAGE_HOSTS?.trim()) vars.PRODUCT_IMAGE_HOSTS = [process.env.PRODUCT_IMAGE_HOSTS.trim(), false];

const existing = (await functions.listVariables({ functionId: FN })).variables;
for (const [key, [value, secret]] of Object.entries(vars)) {
  const v = existing.find((x) => x.key === key);
  if (v) await functions.updateVariable({ functionId: FN, variableId: v.$id, key, value, secret });
  else await functions.createVariable({ functionId: FN, variableId: 'unique()', key, value, secret });
}
step(`set variables: ${Object.keys(vars).join(', ')}`);
if (!S.anthropicKey) console.log('  (no ANTHROPIC_API_KEY — the support bot will use FAQ answers only)');

// ── 4. Package and upload the code ───────────────────────────────────────────
const dir = mkdtempSync(join(tmpdir(), 'myna-fn-'));
const archive = join(dir, 'code.tar.gz');
try {
  execFileSync('tar', ['-czf', archive, '--exclude=node_modules', '--exclude=.DS_Store', '-C', join(ROOT, spec.path), '.'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' }, // no macOS ._ files
  });
  step('packaged functions/myna-api');
  const dep = await functions.createDeployment({
    functionId: FN,
    code: InputFile.fromPath(archive, 'code.tar.gz'),
    activate: true,
    entrypoint: spec.entrypoint,
    commands: spec.commands,
  });
  step(`uploaded deployment ${dep.$id}; building (usually under a minute)…`);

  // ── 5. Wait for the build ──────────────────────────────────────────────────
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const d = await functions.getDeployment({ functionId: FN, deploymentId: dep.$id });
    if (d.status === 'ready') {
      console.log(`\n✓ myna-api is live. Restart the app (npx expo start -c) and try the skin scan again.\n`);
      process.exit(0);
    }
    if (d.status === 'failed' || d.status === 'canceled') {
      console.error(d.buildLogs || '(no build logs)');
      fail(`The build ${d.status}. The log above says why; also see Console → Functions → ${FN} → Deployments.`);
    }
    if (i % 5 === 0) process.stdout.write(`  …${d.status}\n`);
  }
  fail(`Still building after 6 minutes. Check Console → Functions → ${FN} → Deployments.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
