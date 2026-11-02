// Shared settings loader for the setup, doctor and deploy scripts.
//
// Reads, in order of priority:
//   1. variables already set in your shell
//   2. .env.setup  (optional; git-ignored; script-only secrets)
//   3. .env        (the app's settings; git-ignored)
//
// The Appwrite endpoint and project come from the SAME values the app uses
// (EXPO_PUBLIC_APPWRITE_ENDPOINT / EXPO_PUBLIC_APPWRITE_PROJECT_ID), so the scripts and the
// app can't end up pointing at different Appwrite projects. APPWRITE_ENDPOINT /
// APPWRITE_PROJECT_ID still work as overrides.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const file = (name) => fileURLToPath(new URL(`../../${name}`, import.meta.url));

export function loadSettings() {
  const shell = { ...process.env };
  const loaded = [];
  for (const name of ['.env', '.env.setup']) {
    const p = file(name);
    if (!existsSync(p)) continue;
    process.loadEnvFile(p); // later files override earlier ones...
    loaded.push(name);
  }
  Object.assign(process.env, shell); // ...and the shell overrides both

  const env = process.env;
  const pick = (...keys) => keys.map((k) => env[k]?.trim()).find((v) => v && !isPlaceholder(v));

  let appwriteJsonProject = null;
  try {
    appwriteJsonProject = JSON.parse(readFileSync(file('appwrite.json'), 'utf8')).projectId ?? null;
  } catch {
    /* no appwrite.json */
  }

  const s = {
    loaded,
    endpoint: pick('APPWRITE_ENDPOINT', 'EXPO_PUBLIC_APPWRITE_ENDPOINT'),
    projectId: pick('APPWRITE_PROJECT_ID', 'EXPO_PUBLIC_APPWRITE_PROJECT_ID'),
    apiKey: pick('APPWRITE_API_KEY'),
    appProjectId: pick('EXPO_PUBLIC_APPWRITE_PROJECT_ID'),
    scriptProjectId: pick('APPWRITE_PROJECT_ID'),
    appwriteJsonProject: appwriteJsonProject && !isPlaceholder(appwriteJsonProject) ? appwriteJsonProject : null,
    dbId: pick('EXPO_PUBLIC_APPWRITE_DB_ID') || 'myna',
    bucketId: pick('EXPO_PUBLIC_APPWRITE_BUCKET_ID') || 'scans',
    functionId: pick('EXPO_PUBLIC_APPWRITE_FUNCTION_ID') || 'myna-api',
    platform: pick('EXPO_PUBLIC_APPWRITE_PLATFORM') || 'com.myna.skin',
    youcamKey: pick('YOUCAM_API_KEY'),
    masterKek: pick('MASTER_KEK'),
    anthropicKey: pick('ANTHROPIC_API_KEY'),
  };
  return s;
}

export function isPlaceholder(v) {
  return /[<>]|your-|xxx|YOUR_PROJECT_ID/i.test(String(v));
}

/** Project-ID mismatches between the app, the scripts and appwrite.json (the #1 cause of "not found"). */
export function projectMismatches(s) {
  const ids = [
    ['app (.env EXPO_PUBLIC_APPWRITE_PROJECT_ID)', s.appProjectId],
    ['scripts (APPWRITE_PROJECT_ID)', s.scriptProjectId],
    ['appwrite.json projectId', s.appwriteJsonProject],
  ].filter(([, v]) => v);
  const distinct = new Set(ids.map(([, v]) => v));
  return distinct.size > 1 ? ids : [];
}

export function requireConnection(s, { needKey = true } = {}) {
  const missing = [];
  if (!s.endpoint) missing.push('EXPO_PUBLIC_APPWRITE_ENDPOINT');
  if (!s.projectId) missing.push('EXPO_PUBLIC_APPWRITE_PROJECT_ID');
  if (needKey && !s.apiKey) missing.push('APPWRITE_API_KEY');
  if (missing.length) {
    console.error(`\nMissing: ${missing.join(', ')}`);
    console.error('Add them to .env (or .env.setup), replacing anything in < >, then run this again.\n');
    process.exit(1);
  }
  const mismatch = projectMismatches(s);
  if (mismatch.length) {
    console.error('\n✗ These point at DIFFERENT Appwrite projects:');
    for (const [where, id] of mismatch) console.error(`    ${id}  ← ${where}`);
    console.error('\nPick the project you are using in the Console (Overview shows its ID), make all of them match, then run this again.\n');
    process.exit(1);
  }
}
