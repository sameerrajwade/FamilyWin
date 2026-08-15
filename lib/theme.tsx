import React, { createContext, useContext, useState, useEffect } from 'react';
import { Appearance } from 'react-native';
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
  textMuted: '#9CA3AF',
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
  textMuted: '#6B7280',
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
  background: '#FFF5FF',
  surface: '#FFFFFF',
};

const childDarkColors: ThemeColors = {
  ...darkColors,
  primary: '#FF6B2C',
  primaryLight: '#FFB088',
  primaryDark: '#CC4F1A',
  accent: '#6C63FF',
};

// ─── THEME CONTEXT ────────────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark' | 'system';
export type UIMode = 'adult' | 'child';

interface ThemeContextValue {
  colors: ThemeColors;
  themeMode: ThemeMode;
  uiMode: UIMode;
  isDark: boolean;
  isChildMode: boolean;
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

  useEffect(() => {
    // Load persisted preferences
    Promise.all([
      AsyncStorage.getItem('theme_mode'),
      AsyncStorage.getItem('ui_mode'),
    ]).then(([savedTheme, savedUI]) => {
      if (savedTheme) setThemeModeState(savedTheme as ThemeMode);
      if (savedUI) setUIModeState(savedUI as UIMode);
    });
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
      colors, themeMode, uiMode, isDark, isChildMode,
      setThemeMode, setUIMode, fontSize, spacing, iconSize,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
