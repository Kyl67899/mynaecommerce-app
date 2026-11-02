export const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents ?? 0) / 100);

export const CONCERN_LABELS: Record<string, string> = {
  acne: 'Breakouts',
  redness: 'Redness',
  pore: 'Pores',
  texture: 'Texture',
  wrinkle: 'Fine lines',
  moisture: 'Hydration',
  oiliness: 'Oil balance',
  radiance: 'Radiance',
  age_spot: 'Dark spots',
  dark_circle_v2: 'Dark circles',
  eye_bag: 'Eye puffiness',
  firmness: 'Firmness',
  droopy_upper_eyelid: 'Droopy upper eyelid',
  droopy_lower_eyelid: 'Droopy lower eyelid',
  tear_trough: 'Tear trough',
  skin_type: 'Skin type',
};

/** The "?" help text shown next to each concern in the scan picker. */
export const CONCERN_INFO: Record<string, string> = {
  acne: 'Active breakouts and blemishes.',
  redness: 'Visible redness and irritation, a sign of sensitivity.',
  pore: 'How visible and enlarged pores are.',
  texture: 'Smoothness: bumps, roughness and unevenness.',
  wrinkle: 'Fine lines and wrinkles around the eyes, forehead and mouth.',
  moisture: 'How hydrated your skin looks.',
  oiliness: 'Shine and excess oil, mostly across the T-zone.',
  radiance: 'Glow and brightness versus dullness.',
  age_spot: 'Dark spots and uneven pigmentation.',
  dark_circle_v2: 'Darkness under the eyes.',
  eye_bag: 'Puffiness under the eyes.',
  firmness: 'Elasticity and sagging along the cheeks and jaw.',
  droopy_upper_eyelid: 'Sagging of the upper eyelid.',
  droopy_lower_eyelid: 'Sagging of the lower eyelid.',
  tear_trough: 'Hollowness between the lower eyelid and cheek.',
  skin_type: 'Detects whether your skin is normal, oily, dry or combination, and whether it’s redness-prone.',
};

/** Concerns available as product tags (skin type is matched separately via skinTypes). */
export const PRODUCT_CONCERN_KEYS = Object.keys(CONCERN_LABELS).filter((k) => k !== 'skin_type');

export const SKIN_TYPES = [
  { key: 'normal', label: 'Normal', tip: 'Balanced oil and hydration. Focus on protection and maintenance.' },
  { key: 'oily', label: 'Oily', tip: 'Excess shine and visible pores. Look for lightweight, oil-balancing formulas.' },
  { key: 'dry', label: 'Dry', tip: 'Tight or flaky skin. Prioritize barrier repair and rich hydration.' },
  { key: 'combination', label: 'Combination', tip: 'Oily T-zone, drier cheeks. Balance the zones with gentle, layered care.' },
  { key: 'sensitive', label: 'Sensitive', tip: 'Prone to redness. Choose calming, fragrance-free ingredients.' },
] as const;
export const skinTypeLabel = (k: string) => SKIN_TYPES.find((t) => t.key === k)?.label ?? k;

export const concernLabel = (key: string) =>
  CONCERN_LABELS[key] ?? key.replace(/_v\d+$/, '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** YouCam scores are 0-100 where higher means healthier skin for that concern. */
export const scoreBand = (score: number) =>
  score >= 80 ? { label: 'Great', tone: 'good' as const } : score >= 60 ? { label: 'Good', tone: 'ok' as const } : { label: 'Focus', tone: 'focus' as const };

export const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'cleansers', label: 'Cleansers' },
  { key: 'toners', label: 'Toners' },
  { key: 'serums', label: 'Serums' },
  { key: 'moisturizers', label: 'Moisturizers' },
  { key: 'eye-care', label: 'Eye care' },
  { key: 'sunscreen', label: 'Sunscreen' },
] as const;
