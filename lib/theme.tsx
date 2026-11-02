import React, { createContext, useContext, useState, useEffect } from 'react';
import { Appearance, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── THEME TOKENS ─────────────────────────────────────────────────────────────

export interface ThemeColors {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  accent: string;
  success: string;
  successLight: string;
  warning: string;
  warningLight: string;
  danger: string;
  dangerLight: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  card: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  /** Brand-purple TEXT (links, numbers, labels). Same as `primary` in light
   *  mode; a lighter tint in dark mode, where #6C63FF text measured 4.0:1 on
   *  cards (below the 4.5:1 reading minimum). Fills keep using `primary`. */
  textAccent: string;
  /** Red TEXT. Same as `danger` in light mode; softened in dark mode. */
  textDanger: string;
  /** Green / amber TEXT (on a tint or a plain surface). The bright fills read
   *  1.5–1.7:1 as light-mode text, so light mode uses deeper tones (user-approved
   *  2026-11-01); dark mode keeps the brand fills, which already pass. */
  textSuccess: string;
  textWarning: string;
  border: string;
  borderLight: string;
  tabBar: string;
  statusBar: 'light' | 'dark';
  gold: string;
  silver: string;
  bronze: string;
}

const lightColors: ThemeColors = {
  primary: '#6C63FF',
  primaryLight: '#9D97FF',
  primaryDark: '#4A42CC',
  accent: '#FF6B2C',
  success: '#00E676',
  successLight: '#B9F6CA',
  warning: '#FFAB00',
  warningLight: '#FFE082',
  danger: '#FF1744',
  dangerLight: '#FF8A80',
  background: '#F5F5FF',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  card: '#FFFFFF',
  text: '#1A1830',
  textSecondary: '#6B7280',
  // Hint grey darkened 2026-11-01 (#9CA3AF read 2.5:1 on white → 4.8:1).
  textMuted: '#6B7280',
  textAccent: '#6C63FF',
  textDanger: '#FF1744',
  textSuccess: '#127A43',
  textWarning: '#8A5A00',
  border: '#E7E5F2',
  borderLight: '#F3F2FB',
  tabBar: '#FFFFFF',
  statusBar: 'dark',
  gold: '#FFD700',
  silver: '#B0BEC5',
  bronze: '#D4853B',
};

const darkColors: ThemeColors = {
  primary: '#6C63FF',
  primaryLight: '#9D97FF',
  primaryDark: '#4A42CC',
  accent: '#FF6B2C',
  success: '#00E676',
  successLight: '#0A2E1A',
  warning: '#FFAB00',
  warningLight: '#2E2200',
  danger: '#FF1744',
  dangerLight: '#3D0A0A',
  background: '#100E1B',
  surface: '#1A1826',
  surfaceElevated: '#242235',
  card: '#242235',
  text: '#EDECF7',
  textSecondary: '#9CA3AF',
  // Dark-mode text tones (user-approved 2026-10-31): all ≥ 6:1 on dark cards.
  textMuted: '#A1A7B3',
  textAccent: '#9D97FF',
  textDanger: '#FF8A8A',
  textSuccess: '#00E676',
  textWarning: '#FFAB00',
  border: '#2E2B40',
  borderLight: '#242235',
  tabBar: '#1A1826',
  statusBar: 'light',
  gold: '#FFD700',
  silver: '#B0BEC5',
  bronze: '#D4853B',
};

// Child mode uses bigger, more colorful, playful design. It comes in a light
// and a dark variant so toggling the theme still applies in child mode — the
// old single (light-only) child palette ignored dark mode and left the screen
// bright while Settings reported "dark mode".
const childColors: ThemeColors = {
  ...lightColors,
  primary: '#FF6B2C',
  primaryLight: '#FFB088',
  primaryDark: '#CC4F1A',
  accent: '#6C63FF',
  textAccent: '#FF6B2C',
  background: '#FFF5FF',
  surface: '#FFFFFF',
};

const childDarkColors: ThemeColors = {
  ...darkColors,
  primary: '#FF6B2C',
  primaryLight: '#FFB088',
  primaryDark: '#CC4F1A',
  accent: '#6C63FF',
  textAccent: '#FF6B2C', // orange text already passes on dark (6.2:1)
};

// ─── THEME CONTEXT ────────────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark' | 'system';
// 'teen' (engagement 2026-11-01): the standard look, minus confetti bursts and
// with plain wording ("Done", not "I did it!") — suggested for ages 12+.
export type UIMode = 'adult' | 'child' | 'teen';

interface ThemeContextValue {
  colors: ThemeColors;
  themeMode: ThemeMode;
  uiMode: UIMode;
  isDark: boolean;
  isChildMode: boolean;
  isTeenMode: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setUIMode: (mode: UIMode) => void;
  // Child mode sizing helpers
  fontSize: (base: number) => number;
  spacing: (base: number) => number;
  iconSize: (base: number) => number;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Drive off Appearance directly (with a live listener) rather than
  // useColorScheme(): on the New Architecture (RN 0.86 / Fabric) useColorScheme
  // can latch a stale 'light' and never update, which made "Auto" never follow
  // the system into dark mode. getColorScheme() + addChangeListener is reliable.
  const normScheme = (s: unknown): 'light' | 'dark' | null =>
    s === 'dark' ? 'dark' : s === 'light' ? 'light' : null;
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark' | null>(
    () => normScheme(Appearance.getColorScheme()),
  );
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(normScheme(colorScheme));
    });
    return () => sub.remove();
  }, []);

  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [uiMode, setUIModeState] = useState<UIMode>('adult');
  // Gate the first paint on the persisted preference so the app never renders
  // one theme and then flips to another (the cold-start dark→light FOUC). Until
  // AsyncStorage resolves (a few ms) we hold a brand-purple placeholder that
  // matches the animated splash gradient, so the hold is invisible.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Load persisted preferences
    Promise.all([
      AsyncStorage.getItem('theme_mode'),
      AsyncStorage.getItem('ui_mode'),
    ]).then(([savedTheme, savedUI]) => {
      if (savedTheme) setThemeModeState(savedTheme as ThemeMode);
      if (savedUI) setUIModeState(savedUI as UIMode);
    }).finally(() => setHydrated(true));
  }, []);

  async function setThemeMode(mode: ThemeMode) {
    setThemeModeState(mode);
    await AsyncStorage.setItem('theme_mode', mode);
  }

  async function setUIMode(mode: UIMode) {
    setUIModeState(mode);
    await AsyncStorage.setItem('ui_mode', mode);
  }

  const isDark =
    themeMode === 'dark' ||
    (themeMode === 'system' && systemScheme === 'dark');

  const isChildMode = uiMode === 'child';
  const isTeenMode = uiMode === 'teen';

  const colors = isChildMode
    ? (isDark ? childDarkColors : childColors)
    : isDark
    ? darkColors
    : lightColors;

  // Child mode: scale up font sizes and spacing
  const fontSize = (base: number) => isChildMode ? Math.round(base * 1.2) : base;
  const spacing = (base: number) => isChildMode ? Math.round(base * 1.15) : base;
  const iconSize = (base: number) => isChildMode ? Math.round(base * 1.3) : base;

  return (
    <ThemeContext.Provider value={{
      colors, themeMode, uiMode, isDark, isChildMode, isTeenMode,
      setThemeMode, setUIMode, fontSize, spacing, iconSize,
    }}>
      {hydrated
        ? children
        : <View style={{ flex: 1, backgroundColor: '#6C63FF' }} />}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
