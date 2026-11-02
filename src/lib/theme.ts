// myna design tokens. Change these to match the web store exactly; every screen reads from here.
export const colors = {
  bg: '#F6F1EA', // warm cream
  surface: '#FFFFFF',
  surfaceAlt: '#EFE7DC',
  ink: '#1D1A17',
  inkSoft: '#5E5750',
  muted: '#9A9087',
  line: '#E3D9CC',
  accent: '#B4654A', // terracotta
  accentSoft: '#F3DED5',
  good: '#4F7A5A',
  ok: '#C08A2E',
  focus: '#B4654A',
  danger: '#B3261E',
  white: '#FFFFFF',
};

export const radius = { sm: 8, md: 14, lg: 22, pill: 999 };
export const space = (n: number) => n * 4;

export const type = {
  display: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.6, color: colors.ink },
  h1: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.4, color: colors.ink },
  h2: { fontSize: 18, fontWeight: '700' as const, color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink },
  small: { fontSize: 13, color: colors.inkSoft },
  label: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, color: colors.muted },
};
