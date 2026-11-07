export const colors = {
  background: '#F5F7F2', surface: '#FFFFFF', forest: '#163F2C', primary: '#24663D',
  text: '#1C3025', muted: '#53645A', border: '#CDD7CD', soft: '#EAF1E6',
  error: '#A62C32', errorSurface: '#FFF0EF', success: '#1D6338',
};

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
