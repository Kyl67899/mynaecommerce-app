import type { Product, ScanResult, SkinType } from './types';

/** Does this product suit the detected skin type? (sensitive skin must be explicitly supported) */
export function suitsSkinType(p: Product, t?: SkinType | null) {
  if (!t || !p.skinTypes?.length) return false;
  return p.skinTypes.includes(t.base) && (!t.sensitive || p.skinTypes.includes('sensitive'));
}

/** Products for a skin type, best rated first. Used for the live "For your skin type" shelf. */
export const forSkinType = (products: Product[], t: SkinType | null | undefined, limit = 8) =>
  products.filter((p) => p.stock > 0 && suitsSkinType(p, t)).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, limit);

/**
 * Ranks products against a scan. Each product's `concerns` tags use YouCam's keys,
 * so a product earns points for every weak concern it targets (weaker = more points).
 * Deterministic and explainable: every pick lists the concerns it was chosen for.
 */
export function recommend(products: Product[], scan: ScanResult, limit = 6) {
  const focus = scan.concerns.filter((c) => c.score < 75).slice(0, 5);
  const targets = focus.length ? focus : scan.concerns.slice(0, 3);
  const weight = new Map(targets.map((c) => [c.key, 100 - c.score]));

  return products
    .filter((p) => p.stock > 0)
    .map((p) => {
      const matched = (p.concerns ?? []).filter((k) => weight.has(k));
      const typeMatch = suitsSkinType(p, scan.skinType);
      // A product made for the shopper's skin type gets a boost; one that excludes it is pushed down.
      const typePenalty = scan.skinType && p.skinTypes?.length && !typeMatch ? -25 : 0;
      const score = matched.reduce((s, k) => s + (weight.get(k) ?? 0), 0) + (typeMatch ? 20 : 0) + typePenalty + (p.rating ?? 0);
      return { product: p, matched, typeMatch, score };
    })
    .filter((r) => r.matched.length > 0 && r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
