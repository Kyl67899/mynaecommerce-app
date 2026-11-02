// Input hardening against stored XSS and injection.
// Everything a person types (addresses, product names, descriptions) passes through here on the
// server before it's stored, so the data stays safe even if it's later shown on the myna website,
// in an email, or in an admin tool that renders HTML. The app itself never renders HTML.

const CONTROL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200F\\u2028\\u2029\\uFEFF]', 'g');
const TAGS = /<\/?[a-z!?][^>]*>/gi;
const DANGEROUS_SCHEMES = /\b(?:javascript|vbscript|livescript)\s*:|\bdata\s*:\s*[a-z]+\/[a-z0-9.+-]+/gi;
const EVENT_ATTR = /\bon[a-z]+\s*=/gi;

/** Plain text only: strips tags, script URLs, inline handlers and control chars; caps length. */
export function cleanText(value, max = 200, { multiline = false } = {}) {
  if (value == null) return '';
  let s = String(value).normalize('NFKC').replace(CONTROL, '');
  // Strip repeatedly so nested tricks like <scr<script>ipt> collapse fully.
  for (let i = 0; i < 5; i++) {
    const next = s.replace(TAGS, '').replace(DANGEROUS_SCHEMES, '').replace(EVENT_ATTR, '');
    if (next === s) break;
    s = next;
  }
  s = s.replace(/[<>]/g, ''); // any leftover angle brackets can't form markup
  s = multiline ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  return s.trim().slice(0, max);
}

/** Returns a normalized https URL, or null. Optionally restricts to an allowlist of hosts. */
export function safeHttpsUrl(value, allowedHosts = []) {
  if (!value) return null;
  let u;
  try {
    u = new URL(String(value).trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (allowedHosts.length && !allowedHosts.some((h) => host === h || host.endsWith('.' + h))) return null;
  return u.toString().slice(0, 512);
}

export const pickAllowed = (values, allowed) =>
  Array.isArray(values) ? [...new Set(values.map(String).filter((v) => allowed.includes(v)))] : [];

/** Appwrite ids are [A-Za-z0-9._-], max 36, not starting with a special char. */
export const isSafeId = (id) => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(id);
