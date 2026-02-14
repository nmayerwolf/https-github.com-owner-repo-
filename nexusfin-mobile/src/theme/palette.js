export const THEME_OPTIONS = ['dark', 'light'];

const DARK = {
  mode: 'dark',
  bg: '#080F1E',
  surface: '#0F1A2E',
  surfaceAlt: '#15243B',
  border: '#25324B',
  text: '#E0E7F0',
  muted: '#6B7B8D',
  primary: '#00E08E',
  primaryText: '#02130D',
  secondaryButton: '#182740',
  info: '#60A5FA',
  danger: '#FF6B6B',
  positive: '#00E08E',
  negative: '#FF6B6B'
};

const LIGHT = {
  mode: 'light',
  bg: '#F3F6FB',
  surface: '#FFFFFF',
  surfaceAlt: '#EAF0FA',
  border: '#D5DEEA',
  text: '#102035',
  muted: '#5F6F85',
  primary: '#0B8F61',
  primaryText: '#FFFFFF',
  secondaryButton: '#DDE6F3',
  info: '#1D66D9',
  danger: '#C63D49',
  positive: '#0B8F61',
  negative: '#C63D49'
};

export const getThemePalette = (theme) => (theme === 'light' ? LIGHT : DARK);
