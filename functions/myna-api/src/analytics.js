// Anonymized analytics events for the admin dashboard.
// Events never carry a user id, email or address. Scan events hold only scores,
// so admins can see which skin concerns customers need help with, not who has them.
import { ID } from 'node-appwrite';

export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

export const orderEvent = (lines, totalCents, at = new Date()) => ({
  type: 'order_placed',
  day: dayKey(at),
  amountCents: totalCents,
  units: lines.reduce((n, l) => n + l.qty, 0),
  dataJson: JSON.stringify({ items: lines.map(({ productId, name, qty, priceCents }) => ({ productId, name, qty, priceCents })) }),
});

export const scanEvent = (result, at = new Date()) => ({
  type: 'scan_completed',
  day: dayKey(at),
  amountCents: 0,
  units: 1,
  dataJson: JSON.stringify({
    overall: result.overall,
    concerns: Object.fromEntries(result.concerns.map((c) => [c.key, c.score])),
    ...(result.skinType ? { skinType: result.skinType.base, sensitive: !!result.skinType.sensitive } : {}),
  }),
});

export const signupEvent = (at = new Date()) => ({ type: 'signup', day: dayKey(at), amountCents: 0, units: 1, dataJson: '{}' });

/** Best-effort: analytics must never break a checkout or a scan. */
export async function logEvent(tables, databaseId, event, log = () => {}) {
  try {
    await tables.createRow({ databaseId, tableId: 'events', rowId: ID.unique(), data: event });
  } catch (e) {
    log(`analytics event skipped: ${e.message}`);
  }
}
