// Off-line tests for the myna-api function: YouCam flow (with a fake HTTP server) and route guards.
//   node --test scripts/function.test.mjs
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

const { analyzeSkin, normalize, YouCamError } = await import('../functions/myna-api/src/youcam.js');
const handler = (await import('../functions/myna-api/src/main.js')).default;

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch; // never leak the fake into other test files
});

// Sets everything the YouCam client needs inside each test, so results don't depend on
// test order, other test files sharing the process, or variables exported in your shell.
function fakeYouCam({ fail } = {}) {
  process.env.YOUCAM_API_KEY = 'test-key';
  delete process.env.YOUCAM_BASE_URL;
  delete process.env.YOUCAM_ACTIONS;
  const calls = [];
  let polls = 0;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, auth: init.headers?.Authorization });
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/file/skin-analysis'))
      return json({ status: 200, data: { files: [{ file_id: 'f1', requests: [{ url: 'https://upload.example/put', method: 'PUT', headers: { 'Content-Type': 'image/jpeg' } }] }] } });
    if (url === 'https://upload.example/put') return new Response('', { status: 200 });
    if (url.endsWith('/task/skin-analysis')) return json({ status: 200, data: { task_id: 't1' } });
    if (url.endsWith('/task/skin-analysis/t1')) {
      polls++;
      if (polls < 2) return json({ status: 200, data: { task_status: 'running' } });
      if (fail) return json({ status: 200, data: { task_status: 'error', error: 'error_lighting_dark' } });
      return json({
        status: 200,
        data: {
          task_status: 'success',
          results: { output: [
            { type: 'redness', ui_score: 58, raw_score: 41.2 },
            { type: 'moisture', ui_score: '83' },
            { type: 'acne', ui_score: 71 },
            { type: 'all', ui_score: 72 },
            { type: 'skin_age', ui_score: 29 },
          ] },
        },
      });
    }
    throw new Error('unexpected ' + url);
  };
  return calls;
}

test('runs register → upload → task → poll and normalizes scores', { timeout: 20000 }, async () => {
  const calls = fakeYouCam();
  const r = await analyzeSkin(Buffer.from('jpeg'));
  assert.equal(r.overall, 72);
  assert.equal(r.skinAge, 29);
  assert.deepEqual(r.concerns.map((c) => [c.key, c.score]), [['redness', 58], ['acne', 71], ['moisture', 83]]); // weakest first
  const upload = calls.find((c) => c.url.startsWith('https://upload.example'));
  assert.equal(upload.auth, undefined, 'API key must not be sent to the upload host');
  assert.ok(calls.filter((c) => c.url.includes('makeupar')).every((c) => c.auth === 'Bearer test-key'));
});

test('YouCam task errors become friendly retake messages', { timeout: 20000 }, async () => {
  fakeYouCam({ fail: true });
  await assert.rejects(analyzeSkin(Buffer.from('jpeg')), (e) => e instanceof YouCamError && /too dark/.test(e.message));
});

test('normalize derives an overall score when YouCam omits "all"', () => {
  const r = normalize({ output: [{ type: 'pore', ui_score: 60 }, { type: 'texture', ui_score: 80 }] });
  assert.equal(r.overall, 70);
});

const run = async (req) => {
  let out;
  await handler({
    req: { headers: {}, path: '/', body: '', ...req },
    res: { json: (body, status = 200) => (out = { body, status }) },
    log: () => {},
    error: () => {},
  });
  return out;
};

test('rejects calls without a signed-in user', async () => {
  const r = await run({ path: '/keyring' });
  assert.equal(r.status, 401);
});

test('unknown route is a 404', async () => {
  process.env.APPWRITE_FUNCTION_API_ENDPOINT = 'https://example.invalid/v1';
  process.env.APPWRITE_FUNCTION_PROJECT_ID = 'p';
  const r = await run({ path: '/nope', headers: { 'x-appwrite-user-id': 'u1', 'x-appwrite-key': 'k' } });
  assert.equal(r.status, 404);
});

test('order validation runs before touching the database', async () => {
  const r = await run({ path: '/order', headers: { 'x-appwrite-user-id': 'u1', 'x-appwrite-key': 'k' }, bodyJson: { items: [], shipping: {} } });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'Your cart is empty');
});
