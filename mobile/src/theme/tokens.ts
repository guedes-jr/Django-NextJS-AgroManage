import type { TextStyle } from 'react-native';

// Shared roles. Titles use `forest` (ink), actions/selection use `primary` (one accent).
// Secondary text is tinted green, never flat gray; contrast ratios measured on `surface`.
export const colors = {
  background: '#F5F7F2', surface: '#FFFFFF', forest: '#163F2C', primary: '#24663D',
  text: '#1C3025', muted: '#53645A', border: '#CDD7CD', soft: '#EAF1E6',
  error: '#A62C32', errorSurface: '#FFF0EF', success: '#1D6338',
  // Body copy between `text` and `muted` (8.0:1).
  textSoft: '#3E5544',
  // Decorative outline for cards/panels; not a control boundary.
  borderSoft: '#DCE5D7',
  divider: '#E7EDE2',
  // Control boundary (inputs, outlined buttons) — 3.5:1 on surface.
  inputBorder: '#7A8F7C',
  // Quiet surfaces: secondary buttons, segmented tracks, chips, icon tiles.
  softStrong: '#E7EFDF', primarySoft: '#EBF4EA', track: '#E9EFE4',
  // Semantic tones (text ≥ 4.5:1 on their surface).
  warning: '#8F5A17', warningSurface: '#FFF3E2',
  info: '#116C78', infoSurface: '#E7F5F5',
  neutral: '#566978', neutralSurface: '#EFF2F5',
  danger: '#9A3028',
  successSurface: '#E6F2E8',
  overlay: 'rgba(19,42,27,0.42)',
} as const;

// Brand shell only (header, bottom navigation, auth). Not for operational content.
export const brand = {
  deep: '#00451F', lime: '#D1F900', limeText: '#DFFF48', gold: '#FFD600', onLime: '#123A1D',
} as const;

// 4-based spacing scale: tight inside a group, generous between groups.
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, sheet: 24, pill: 999 } as const;

export const type = {
  screenTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3, color: colors.forest },
  sectionTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2, color: colors.forest },
  recordTitle: { fontSize: 16, fontWeight: '700', color: colors.forest },
  body: { fontSize: 15, lineHeight: 22, color: colors.textSoft },
  meta: { fontSize: 13, lineHeight: 19, color: colors.muted },
  caption: { fontSize: 12, lineHeight: 17, color: colors.muted },
  // Metrics and quantities: digits must not shift between values.
  numeric: { fontVariant: ['tabular-nums'] },
} as const satisfies Record<string, TextStyle>;

// Minimum interactive area (logical units) for every pressable.
export const touchTarget = 44;

// 75% visual reference through layout density, with mobile readability/touch floors.
export const authSizing = {
  contentWidth: 390,
  formWidth: 360,
  horizontalPadding: 18,
  sectionGap: 14,
  brandFormGap: 24,
  signupGap: 20,
  legalGap: 28,
  controlHeight: 48,
  touchTarget: 44,
  inputFont: 16,
  labelFont: 14,
  buttonFont: 18,
  logo: 54,
  smallLogo: 48,
  brandFont: 30,
  smallBrandFont: 27,
  brandPlus: 23,
  brandHeightMin: 120,
  brandHeightMax: 156,
  backgroundClearance: 86,
} as const;
