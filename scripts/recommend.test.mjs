// Skin-type-aware recommendations.
import assert from 'node:assert/strict';
import { test } from 'node:test';
const { recommend, forSkinType, suitsSkinType } = await import('../src/lib/recommend.ts');

const P = (id, concerns, skinTypes, extra = {}) => ({ $id: id, name: id, stock: 10, rating: 4.5, priceCents: 1000, concerns, skinTypes, ...extra });
const products = [
  P('oil-gel', ['oiliness', 'pore'], ['oily', 'combination']),
  P('rich-cream', ['moisture'], ['dry', 'sensitive']),
  P('cica', ['redness'], ['oily', 'dry', 'combination', 'normal', 'sensitive']),
  P('bha', ['pore', 'acne'], ['oily']),
  P('sold-out', ['pore'], ['combination'], { stock: 0 }),
];
const scan = (base, sensitive, concerns) => ({ overall: 70, skinAge: null, analyzedAt: '', concerns, skinType: { label: base, base, sensitive, source: 'youcam' } });

test('sensitive skin only gets products that list sensitive', () => {
  const t = { base: 'dry', sensitive: true };
  assert.equal(suitsSkinType(products[1], t), true);
  assert.equal(suitsSkinType(P('x', [], ['dry']), t), false);
});

test('"for your skin type" shelf is filtered by type and stock', () => {
  const ids = forSkinType(products, { base: 'combination', sensitive: false }).map((p) => p.$id);
  assert.deepEqual(ids.sort(), ['cica', 'oil-gel']);
});

test('products made for the detected type rank above ones that exclude it', () => {
  const r = recommend(products, scan('combination', false, [{ key: 'pore', score: 50 }, { key: 'oiliness', score: 55 }]));
  assert.equal(r[0].product.$id, 'oil-gel'); // targets both + suits combination
  assert.ok(r.find((x) => x.product.$id === 'oil-gel').typeMatch);
  const bha = r.findIndex((x) => x.product.$id === 'bha'); // oily-only: penalized for combination skin
  assert.ok(bha === -1 || bha > 0);
  assert.ok(!r.some((x) => x.product.$id === 'sold-out'));
});
