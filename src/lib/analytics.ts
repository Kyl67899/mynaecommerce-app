// Pure analytics math for the admin dashboard (no I/O, so it's easy to test).
import type { EventRow, Product } from './types';

export const FOCUS_THRESHOLD = 70; // a concern scoring below this is one the shopper needs help with

export type ScanSample = { overall: number; concerns: Record<string, number>; skinType?: string; sensitive?: boolean };

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const parse = <T,>(s?: string | null, fallback = {} as T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

export function lastDays(n: number, end = new Date()) {
  return Array.from({ length: n }, (_, i) => dayKey(new Date(end.getTime() - (n - 1 - i) * 86400000)));
}

function totals(events: EventRow[]) {
  let revenueCents = 0,
    orders = 0,
    units = 0,
    scans = 0,
    signups = 0,
    scoreSum = 0;
  for (const e of events) {
    if (e.type === 'order_placed') {
      revenueCents += e.amountCents ?? 0;
      orders++;
      units += e.units ?? 0;
    } else if (e.type === 'scan_completed') {
      scans++;
      scoreSum += parse<ScanSample>(e.dataJson).overall ?? 0;
    } else if (e.type === 'signup') signups++;
  }
  return {
    revenueCents,
    orders,
    units,
    scans,
    signups,
    aovCents: orders ? Math.round(revenueCents / orders) : 0,
    avgSkinScore: scans ? Math.round(scoreSum / scans) : null,
  };
}

export const scanSamples = (events: EventRow[]) =>
  events.filter((e) => e.type === 'scan_completed').map((e) => parse<ScanSample>(e.dataJson, { overall: 0, concerns: {} }));

/** Share of scans (0-1) where at least one of `concerns` is a focus area: the audience a product would be recommended to. */
export function reach(concerns: string[], samples: ScanSample[]) {
  if (!samples.length || !concerns.length) return 0;
  const hit = samples.filter((s) => concerns.some((k) => (s.concerns?.[k] ?? 100) < FOCUS_THRESHOLD)).length;
  return hit / samples.length;
}

/**
 * @param events covering the last 2×days, so we can compare with the previous period
 */
export function computeMetrics(events: EventRow[], products: Product[], days: number, now = new Date()) {
  const window = lastDays(days, now);
  const start = window[0];
  const prevStart = lastDays(days * 2, now)[0];
  const current = events.filter((e) => e.day >= start);
  const previous = events.filter((e) => e.day >= prevStart && e.day < start);

  const cur = totals(current);
  const prev = totals(previous);
  const delta = (a: number, b: number) => (b ? (a - b) / b : a ? 1 : 0);

  const byDay = new Map(window.map((d) => [d, { day: d, revenueCents: 0, orders: 0, scans: 0, signups: 0 }]));
  for (const e of current) {
    const d = byDay.get(e.day);
    if (!d) continue;
    if (e.type === 'order_placed') {
      d.revenueCents += e.amountCents ?? 0;
      d.orders++;
    } else if (e.type === 'scan_completed') d.scans++;
    else if (e.type === 'signup') d.signups++;
  }

  const productAgg = new Map<string, { productId: string; name: string; units: number; revenueCents: number }>();
  for (const e of current) {
    if (e.type !== 'order_placed') continue;
    for (const it of parse<{ items?: { productId: string; name: string; qty: number; priceCents: number }[] }>(e.dataJson).items ?? []) {
      const a = productAgg.get(it.productId) ?? { productId: it.productId, name: it.name, units: 0, revenueCents: 0 };
      a.units += it.qty;
      a.revenueCents += it.qty * it.priceCents;
      productAgg.set(it.productId, a);
    }
  }

  // Skin-concern demand vs. what the shelf covers. This drives "what product should we add next?"
  const samples = scanSamples(current);
  const keys = new Set<string>();
  samples.forEach((s) => Object.keys(s.concerns ?? {}).forEach((k) => keys.add(k)));
  const inStock = products.filter((p) => p.stock > 0);
  const concernDemand = [...keys]
    .map((key) => {
      const scores = samples.map((s) => s.concerns[key]).filter((v): v is number => typeof v === 'number');
      const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const focusShare = scores.length ? scores.filter((v) => v < FOCUS_THRESHOLD).length / scores.length : 0;
      const coverage = inStock.filter((p) => p.concerns?.includes(key)).length;
      return { key, avgScore, focusShare, coverage, gap: focusShare >= 0.25 && coverage <= 1 };
    })
    .sort((a, b) => b.focusShare - a.focusShare);

  // Skin-type mix of everyone who scanned in the period (anonymized)
  const typeCounts = new Map<string, number>();
  for (const smp of samples) {
    if (!smp.skinType) continue;
    typeCounts.set(smp.skinType, (typeCounts.get(smp.skinType) ?? 0) + 1);
    if (smp.sensitive) typeCounts.set('sensitive', (typeCounts.get('sensitive') ?? 0) + 1);
  }
  const typed = samples.filter((x) => x.skinType).length;
  const skinTypeMix = [...typeCounts.entries()]
    .map(([key, count]) => ({ key, count, share: typed ? count / typed : 0, coverage: inStock.filter((p) => p.skinTypes?.includes(key)).length }))
    .sort((a, b) => b.count - a.count);

  return {
    ...cur,
    skinTypeMix,
    deltas: {
      revenue: delta(cur.revenueCents, prev.revenueCents),
      orders: delta(cur.orders, prev.orders),
      scans: delta(cur.scans, prev.scans),
      signups: delta(cur.signups, prev.signups),
    },
    daily: [...byDay.values()],
    topProducts: [...productAgg.values()].sort((a, b) => b.units - a.units).slice(0, 5),
    concernDemand,
    lowStock: products.filter((p) => p.stock <= 10).sort((a, b) => a.stock - b.stock),
    hasDemo: current.some((e) => parse<{ demo?: boolean }>(e.dataJson).demo),
    samples,
  };
}

export type Metrics = ReturnType<typeof computeMetrics>;
