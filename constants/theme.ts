export const Colors = {
  // Brand
  primary: '#6C63FF',
  primaryLight: '#9D97FF',
  primaryDark: '#4A42CC',
  accent: '#FF6B2C',
  accentLight: '#FFB088',

  // Semantic
  success: '#00E676',
  successLight: '#B9F6CA',
  warning: '#FFAB00',
  warningLight: '#FFE082',
  danger: '#FF1744',
  dangerLight: '#FF8A80',
  info: '#4FC3F7',

  // Points
  positivePoints: '#00E676',
  negativePoints: '#FF1744',

  // Backgrounds
  background: '#F5F5FF',
  backgroundDark: '#100E1B',
  surface: '#FFFFFF',
  surfaceDark: '#1A1826',
  card: '#FFFFFF',
  cardDark: '#242235',

  // Text
  text: '#1A1830',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textDark: '#EDECF7',
  textSecondaryDark: '#9CA3AF',

  // Borders
  border: '#E7E5F2',
  borderDark: '#2E2B40',

  // Ranks
  gold: '#FFD700',
  silver: '#B0BEC5',
  bronze: '#D4853B',

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

export const Gradients = {
  primary: ['#6C63FF', '#9D97FF', '#FF6B2C'] as const,
  primaryButton: ['#6C63FF', '#8B84FF'] as const,
  gold: ['#FFD700', '#FFA000'] as const,
  silver: ['#EAF0F7', '#8595AC'] as const,
  bronze: ['#D4853B', '#A05A2C'] as const,
  success: ['#00E676', '#00C853'] as const,
  darkSurface: ['rgba(108,99,255,0.06)', 'transparent'] as const,
};

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
