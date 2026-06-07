export const Colors = {
  // Brand
  primary: '#6C63FF',
  primaryLight: '#9D97FF',
  primaryDark: '#4A42CC',
  accent: '#FF6584',
  accentLight: '#FF9BAF',

  // Semantic
  success: '#43D98F',
  successLight: '#B8F5DA',
  warning: '#FFB347',
  warningLight: '#FFE0A3',
  danger: '#FF5C5C',
  dangerLight: '#FFB3B3',
  info: '#4FC3F7',

  // Points
  positivePoints: '#43D98F',
  negativePoints: '#FF5C5C',

  // Backgrounds
  background: '#F8F9FF',
  backgroundDark: '#12121F',
  surface: '#FFFFFF',
  surfaceDark: '#1E1E2E',
  card: '#FFFFFF',
  cardDark: '#252535',

  // Text
  text: '#1A1A2E',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textDark: '#F1F1F1',
  textSecondaryDark: '#9CA3AF',

  // Borders
  border: '#E5E7EB',
  borderDark: '#374151',

  // Ranks
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',

  // Categories
  chores: '#4FC3F7',
  homework: '#9C27B0',
  hygiene: '#26A69A',
  behavior: '#FF7043',
  extras: '#66BB6A',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  display: 42,
} as const;

export const FontFamily = {
  regular: 'Nunito-Regular',
  semiBold: 'Nunito-SemiBold',
  bold: 'Nunito-Bold',
  extraBold: 'Nunito-ExtraBold',
  black: 'Nunito-Black',
} as const;

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

export const CATEGORY_COLORS: Record<string, string> = {
  chores: Colors.chores,
  homework: Colors.homework,
  hygiene: Colors.hygiene,
  behavior: Colors.behavior,
  extras: Colors.extras,
};

export const CATEGORY_ICONS: Record<string, string> = {
  chores: '🧹',
  homework: '📚',
  hygiene: '🚿',
  behavior: '⭐',
  extras: '🎯',
};

export const DIFFICULTY_POINTS: Record<string, number> = {
  easy: 10,
  medium: 25,
  hard: 50,
};

export const AVATAR_EMOJIS = [
  '🦁', '🐯', '🐻', '🦊', '🐺', '🦝',
  '🐸', '🐧', '🦋', '🐬', '🦄', '🐲',
  '🦸', '🧙', '👑', '🌟', '🚀', '⚡',
];
