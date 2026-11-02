// XSS / input-hardening and skin-type tests.
//   node --test scripts/security.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

const server = await import('../functions/myna-api/src/sanitize.js');
const client = await import('../src/lib/sanitize.ts');
const { cleanProduct } = await import('../functions/myna-api/src/main.js');
const handler = (await import('../functions/myna-api/src/main.js')).default;
const { actionsFor, normalize, estimateSkinType } = await import('../functions/myna-api/src/youcam.js');

// Classic payloads from the OWASP XSS filter evasion cheat sheet
const PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg/onload=alert(1)>',
  '<a href="javascript:alert(1)">click</a>',
  'JaVaScRiPt:alert(1)',
  '<scr<script>ipt>alert(1)</scr</script>ipt>',
  '<iframe src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">',
  '"><body onload=alert(1)>',
  '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
  'Ｈello＜script＞alert(1)＜/script＞', // full-width brackets normalize to < >
  'line\u2028break\u0000null',
];

test('server and app sanitizers neutralize every payload identically', () => {
  for (const p of PAYLOADS) {
    const a = server.cleanText(p);
    const b = client.cleanText(p);
    assert.equal(a, b, `mismatch for ${p}`);
    assert.ok(!/[<>]/.test(a), `angle bracket survived: ${a}`);
    assert.ok(!/javascript\s*:/i.test(a), `script URL survived: ${a}`);
    assert.ok(!/\bon[a-z]+\s*=/i.test(a), `event handler survived: ${a}`);
    assert.ok(!/[\u0000\u2028]/.test(a));
  }
});

test('ordinary text is left alone', () => {
  for (const t of ['Calm Cica Serum', 'Vitamin C 15% + ferulic', 'Clinical data: 95% saw results', 'Apt 4B, O’Neil St.', 'Tampa, FL 33602']) {
    assert.equal(server.cleanText(t), t);
  }
  assert.equal(server.cleanText('a\n\n\n\nb', 50, { multiline: true }), 'a\n\nb');
});

test('only plain https URLs are accepted for images', () => {
  const hosts = ['appwrite.io', 'picsum.photos'];
  assert.equal(server.safeHttpsUrl('javascript:alert(1)'), null);
  assert.equal(server.safeHttpsUrl('http://picsum.photos/x'), null);
  assert.equal(server.safeHttpsUrl('https://user:pw@picsum.photos/x'), null);
  assert.equal(server.safeHttpsUrl('data:image/png;base64,AAA'), null);
  assert.equal(server.safeHttpsUrl('https://evil.example/x.png', hosts), null);
  assert.equal(server.safeHttpsUrl('https://picsum.photos.evil.com/x', hosts), null);
  assert.ok(server.safeHttpsUrl('https://nyc.cloud.appwrite.io/v1/storage/x', hosts));
  assert.equal(client.safeHttpsUrl('javascript:alert(1)'), null);
});

test('deep-link ids are validated', () => {
  assert.equal(client.safeId('calm-cica-serum'), 'calm-cica-serum');
  assert.equal(client.safeId(['abc123']), 'abc123');
  for (const bad of ['../admin', '<script>', '', 'a'.repeat(37), '-leading', 'x y', undefined, 42]) assert.equal(client.safeId(bad), undefined);
  assert.equal(server.isSafeId('../etc'), false);
});

test('product sanitizer strips markup and drops bad values before any storefront sees them', () => {
  process.env.APPWRITE_FUNCTION_API_ENDPOINT = 'https://nyc.cloud.appwrite.io/v1';
  const out = cleanProduct({
    name: 'Glow <img src=x onerror=alert(1)>Serum',
    brand: '<b>myna</b>',
    description: 'Great<script>steal()</script> for skin',
    category: 'malware',
    imageUrl: 'javascript:alert(1)',
    concerns: ['redness', '<x>', 'skin_type'],
    skinTypes: ['oily', 'hacker'],
  });
  assert.equal(out.name, 'Glow Serum');
  assert.equal(out.brand, 'myna');
  assert.equal(out.description, 'Greatsteal() for skin');
  assert.equal(out.category, 'serums');
  assert.equal(out.imageUrl, null);
  assert.deepEqual(out.concerns, ['redness']);
  assert.deepEqual(out.skinTypes, ['oily']);
});

const call = async (path, bodyJson) => {
  let out;
  await handler({
    req: { headers: { 'x-appwrite-user-id': 'u1', 'x-appwrite-key': 'k' }, path, bodyJson },
    res: { json: (body, status = 200) => (out = { body, status }) },
    log: () => {},
    error: () => {},
  });
  return out;
};

test('/scan rejects bad ids and modes before touching storage', async () => {
  assert.equal((await call('/scan', { fileId: '../x', scanId: 'ok1' })).status, 400);
  assert.equal((await call('/scan', { fileId: 'f1', scanId: 's1', mode: 'ultra' })).status, 400);
});

test('/order rejects injected product ids', async () => {
  const r = await call('/order', { items: [{ productId: '<script>', qty: 1 }], shipping: { name: 'a', line1: 'b', city: 'c', postalCode: 'd', country: 'US' } });
  assert.equal(r.status, 400);
});

test('concern picker maps to YouCam SD/HD actions; skin type pulls in its inputs', () => {
  const hd = actionsFor('hd', ['skin_type', 'dark_circle_v2', 'tear_trough', 'not_a_concern']);
  assert.equal(hd.mode, 'hd');
  assert.deepEqual(hd.actions.sort(), ['hd_dark_circle', 'hd_moisture', 'hd_oiliness', 'hd_redness', 'hd_skin_type', 'hd_tear_trough'].sort());
  const sd = actionsFor('sd', ['acne']);
  assert.deepEqual(sd.actions, ['acne']);
  assert.equal(actionsFor('bogus', []).mode, 'sd');
  assert.equal(actionsFor('sd', []).actions.length, 16); // nothing picked → full analysis
  assert.ok(actionsFor('hd', []).actions.every((a) => a.startsWith('hd_')));
});

test('HD results normalize to the same keys and read YouCam’s skin-type label + zones', () => {
  const r = normalize(
    {
      output: [
        { type: 'hd_redness', ui_score: 52, raw_score: 40 },
        { type: 'hd_dark_circle', ui_score: 70 },
        { type: 'hd_oiliness', ui_score: 55 },
        { type: 'hd_moisture', ui_score: 81 },
        { type: 'hd_skin_type', whole: { ui_score: 1, skin_type: 'Combination & Redness' }, t_zone: { label: 'Oily' }, u_zone: { label: 'Dry' }, mask_urls: ['https://x/oily.png'] },
      ],
    },
    { mode: 'hd', wantSkinType: true },
  );
  assert.deepEqual(r.concerns.map((c) => c.key), ['redness', 'oiliness', 'dark_circle_v2', 'moisture']);
  assert.equal(r.skinType.base, 'combination');
  assert.equal(r.skinType.sensitive, true);
  assert.equal(r.skinType.source, 'youcam');
  assert.deepEqual(r.skinType.zones, { t_zone: 'Oily', u_zone: 'Dry' });
})

test('skin type is estimated from oil/hydration/redness when no label comes back', () => {
  assert.equal(estimateSkinType({ oiliness: 40, moisture: 85, redness: 90 }).label, 'Oily');
  assert.equal(estimateSkinType({ oiliness: 40, moisture: 45, redness: 90 }).base, 'combination');
  assert.equal(estimateSkinType({ oiliness: 90, moisture: 40, redness: 50 }).label, 'Dry & Redness-prone');
  assert.equal(estimateSkinType({ oiliness: 80, moisture: 80, redness: 80 }).base, 'normal');
  const r = normalize({ output: [{ type: 'oiliness', ui_score: 45 }, { type: 'moisture', ui_score: 88 }, { type: 'redness', ui_score: 90 }] }, { wantSkinType: true });
  assert.equal(r.skinType.source, 'estimated');
  assert.equal(r.skinType.base, 'oily');
});
