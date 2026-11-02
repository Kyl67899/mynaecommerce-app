// YouCam (Perfect Corp) AI Skin Analysis, V2 server-to-server API.
// Flow: register file → PUT bytes to the presigned URL → create task → poll → normalize.
// The API key lives only in this function's environment; the app never sees it.

const base = () => (process.env.YOUCAM_BASE_URL || 'https://yce-api-01.makeupar.com/s2s/v2.0').replace(/\/+$/, '');

// Every concern the YouCam playground offers, with its SD and HD action names.
// Keys are what the app, products and analytics use; SD and HD can't be mixed in one request.
export const CONCERNS = {
  acne: { sd: 'acne', hd: 'hd_acne' },
  redness: { sd: 'redness', hd: 'hd_redness' },
  pore: { sd: 'pore', hd: 'hd_pore' },
  texture: { sd: 'texture', hd: 'hd_texture' },
  wrinkle: { sd: 'wrinkle', hd: 'hd_wrinkle' },
  moisture: { sd: 'moisture', hd: 'hd_moisture' },
  oiliness: { sd: 'oiliness', hd: 'hd_oiliness' },
  radiance: { sd: 'radiance', hd: 'hd_radiance' },
  age_spot: { sd: 'age_spot', hd: 'hd_age_spot' },
  dark_circle_v2: { sd: 'dark_circle_v2', hd: 'hd_dark_circle' },
  eye_bag: { sd: 'eye_bag', hd: 'hd_eye_bag' },
  firmness: { sd: 'firmness', hd: 'hd_firmness' },
  droopy_upper_eyelid: { sd: 'droopy_upper_eyelid', hd: 'hd_droopy_upper_eyelid' },
  droopy_lower_eyelid: { sd: 'droopy_lower_eyelid', hd: 'hd_droopy_lower_eyelid' },
  tear_trough: { sd: 'tear_trough', hd: 'hd_tear_trough' },
  skin_type: { sd: 'skin_type', hd: 'hd_skin_type' },
};
export const CONCERN_KEYS = Object.keys(CONCERNS);
export const MODES = ['sd', 'hd'];
export const SKIN_TYPES = ['normal', 'oily', 'dry', 'combination'];

// Reverse lookup: any YouCam result type → our key
const KEY_BY_ACTION = Object.fromEntries(Object.entries(CONCERNS).flatMap(([k, v]) => [[v.sd, k], [v.hd, k]]));

const FRIENDLY_ERRORS = {
  error_no_face: 'We could not find a face. Face the camera straight on and try again.',
  error_src_face_too_small: 'Move a little closer so your face fills more of the frame.',
  error_src_face_out_of_bound: 'Keep your whole face inside the frame.',
  error_lighting_dark: 'The photo is too dark. Find soft, even light (a window works well).',
  error_below_min_image_size: 'That photo is too small. HD needs at least 1080px on the short side; try SD or the rear camera.',
  exceed_max_filesize: 'That photo is larger than 10 MB.',
  error_decode_image: 'We could not read that image. Try a JPG or PNG.',
};

export class YouCamError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function key() {
  const k = process.env.YOUCAM_API_KEY;
  if (!k) throw new Error('YOUCAM_API_KEY is not set');
  return k;
}

async function call(path, init = {}) {
  const res = await fetch(base() + path, {
    ...init,
    headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json.status && json.status !== 200)) {
    const code = json.error_code || json.error || `http_${res.status}`;
    throw new YouCamError(code, FRIENDLY_ERRORS[code] || json.message || `YouCam request failed (${code})`);
  }
  return json.data ?? json;
}

/**
 * Validates the shopper's picks (allowlist only) and returns YouCam action names.
 * Skin type also pulls in oiliness, moisture and redness so we can explain (or estimate) the type.
 */
export function actionsFor(mode = 'sd', concerns = []) {
  const m = MODES.includes(mode) ? mode : 'sd';
  let keys = Array.isArray(concerns) ? [...new Set(concerns.filter((c) => CONCERN_KEYS.includes(c)))] : [];
  if (!keys.length) keys = CONCERN_KEYS.slice();
  if (keys.includes('skin_type')) keys = [...new Set([...keys, 'oiliness', 'moisture', 'redness'])];
  return { mode: m, keys, actions: keys.map((k) => CONCERNS[k][m]) };
}

/** Runs a full analysis on JPEG/PNG bytes and returns normalized scores. */
export async function analyzeSkin(bytes, { contentType = 'image/jpeg', mode = 'sd', concerns = [], log = () => {} } = {}) {
  const plan = actionsFor(mode, concerns);

  const reg = await call('/file/skin-analysis', {
    method: 'POST',
    body: JSON.stringify({ files: [{ content_type: contentType, file_name: 'selfie.jpg', file_size: bytes.length }] }),
  });
  const file = reg.files?.[0];
  const upload = file?.requests?.[0];
  if (!file?.file_id || !upload?.url) throw new YouCamError('bad_upload', 'YouCam did not return an upload URL');

  // The API key is NOT sent to the storage host.
  const put = await fetch(upload.url, { method: upload.method || 'PUT', headers: upload.headers || { 'Content-Type': contentType }, body: bytes });
  if (!put.ok) throw new YouCamError('upload_failed', `Upload to YouCam failed (${put.status})`);

  const task = await call('/task/skin-analysis', {
    method: 'POST',
    body: JSON.stringify({ src_file_id: file.file_id, dst_actions: plan.actions, miniserver_args: { enable_mask_overlay: false }, format: 'json' }),
  });
  const taskId = task.task_id;
  if (!taskId) throw new YouCamError('no_task', 'YouCam did not return a task id');
  log(`youcam task ${taskId} (${plan.mode}, ${plan.actions.length} concerns)`);

  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await call(`/task/skin-analysis/${taskId}`, { method: 'GET' });
    const status = s.task_status || s.status;
    if (status === 'success') return normalize(s.results ?? s.result ?? s, { mode: plan.mode, wantSkinType: plan.keys.includes('skin_type') });
    if (status === 'error' || status === 'failed') {
      const code = s.error || s.error_code || 'analysis_failed';
      throw new YouCamError(code, FRIENDLY_ERRORS[code] || s.error_message || 'Skin analysis failed');
    }
  }
  throw new YouCamError('timeout', 'Skin analysis took too long. Please try again.');
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(+v) ? +v : null);
const LABEL_RE = /\b(normal|oily|dry|combination)\b/i;

/** Finds a human skin-type label anywhere in a YouCam skin_type result (ignores URLs/mask names). */
function findLabel(obj, depth = 0) {
  if (obj == null || depth > 4) return null;
  if (typeof obj === 'string') return /https?:|\.png$/i.test(obj) ? null : LABEL_RE.test(obj) ? obj : null;
  if (typeof obj !== 'object') return null;
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'type' || k === 'mask_urls' || k === 'output_mask_name') continue;
    const hit = findLabel(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

export function describeSkinType(label, source) {
  const base = (label.match(LABEL_RE)?.[1] ?? 'normal').toLowerCase();
  const sensitive = /redness|sensitive/i.test(label);
  const pretty = base.charAt(0).toUpperCase() + base.slice(1) + (sensitive ? ' & Redness-prone' : '');
  return { label: pretty, base, sensitive, source };
}

/** Same 8 categories YouCam uses, derived from oil, hydration and redness scores (higher = healthier). */
export function estimateSkinType(scores) {
  const oily = (scores.oiliness ?? 100) < 60;
  const dry = (scores.moisture ?? 100) < 60;
  const sensitive = (scores.redness ?? 100) < 60;
  const base = oily && dry ? 'combination' : oily ? 'oily' : dry ? 'dry' : 'normal';
  return describeSkinType(base + (sensitive ? ' redness' : ''), 'estimated');
}

/**
 * Turns YouCam's result into the compact shape we store (encrypted):
 *   { mode, overall, skinAge, skinType, concerns: [{ key, score, raw }] }   scores 0-100, higher = healthier
 * Mask URLs expire after a couple of hours, so they are not persisted.
 */
export function normalize(results, { mode = 'sd', wantSkinType = false } = {}) {
  const list = Array.isArray(results) ? results : results?.output ?? [];
  const concerns = [];
  let overall = null;
  let skinAge = null;
  let skinTypeRaw = null;

  for (const o of list) {
    const type = o.type || o.name;
    if (!type) continue;
    const key = KEY_BY_ACTION[type] ?? type.replace(/^hd_/, '');
    if (key === 'skin_type') {
      skinTypeRaw = o;
      continue;
    }
    const score = num(o.ui_score ?? o.score ?? o.score_info?.ui_score);
    if (score == null) continue;
    if (key === 'all') overall = Math.round(score);
    else if (key === 'skin_age') skinAge = Math.round(score);
    else concerns.push({ key, score: Math.round(score), raw: num(o.raw_score) });
  }
  if (!concerns.length && !skinTypeRaw) throw new YouCamError('empty_result', 'The analysis returned no scores. Please retake the photo.');
  if (overall == null && concerns.length) overall = Math.round(concerns.reduce((a, c) => a + c.score, 0) / concerns.length);
  concerns.sort((a, b) => a.score - b.score); // weakest first

  let skinType = null;
  if (skinTypeRaw || wantSkinType) {
    const scores = Object.fromEntries(concerns.map((c) => [c.key, c.score]));
    const label = skinTypeRaw && findLabel(skinTypeRaw);
    skinType = label ? describeSkinType(label, 'youcam') : estimateSkinType(scores);
    // Zone detail (T-zone / U-zone) when YouCam provides labels for them
    const zones = {};
    for (const z of ['t_zone', 'u_zone']) {
      const zl = skinTypeRaw && findLabel(skinTypeRaw[z]);
      if (zl) zones[z] = describeSkinType(zl, 'youcam').label;
    }
    if (Object.keys(zones).length) skinType.zones = zones;
  }

  return { mode, overall: overall ?? 0, skinAge, skinType, concerns, analyzedAt: new Date().toISOString() };
}
