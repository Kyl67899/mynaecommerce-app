// Client-side input hygiene (defense in depth; the server re-sanitizes everything it stores).
// React Native renders text, never HTML, so markup typed into a field can't execute in the app.
// These helpers make sure such markup also never reaches the database, deep links or other surfaces.

const CONTROL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200F\\u2028\\u2029\\uFEFF]', 'g');
const TAGS = /<\/?[a-z!?][^>]*>/gi;
const DANGEROUS_SCHEMES = /\b(?:javascript|vbscript|livescript)\s*:|\bdata\s*:\s*[a-z]+\/[a-z0-9.+-]+/gi;
const EVENT_ATTR = /\bon[a-z]+\s*=/gi;

/** Same rules as functions/myna-api/src/sanitize.js cleanText. */
export function cleanText(value: unknown, max = 200, { multiline = false } = {}): string {
  if (value == null) return '';
  let s = String(value).normalize('NFKC').replace(CONTROL, '');
  for (let i = 0; i < 5; i++) {
    const next = s.replace(TAGS, '').replace(DANGEROUS_SCHEMES, '').replace(EVENT_ATTR, '');
    if (next === s) break;
    s = next;
  }
  s = s.replace(/[<>]/g, '');
  s = multiline ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  return s.trim().slice(0, max);
}

export const cleanEmail = (email: string) => cleanText(email, 254).toLowerCase().replace(/\s/g, '');

/** https-only URL (or null). Blocks javascript:, data:, credentials in the URL, etc. */
export function safeHttpsUrl(value: unknown): string | null {
  if (!value) return null;
  try {
    const u = new URL(String(value).trim());
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Route params come from deep links (myna://product/<id>) that anyone can craft.
 * Only well-formed Appwrite ids (and the literal "new" for the editor) are accepted.
 */
export function safeId(value: unknown): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(v) ? v : undefined;
}

/** Digits only, fixed length: for OTP fields. */
export const otpDigits = (s: string, len = 6) => s.replace(/\D/g, '').slice(0, len);
