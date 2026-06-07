import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme, Appearance } from 'react-native';
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
  accent: '#FF6584',
  success: '#43D98F',
  successLight: '#B8F5DA',
  warning: '#FFB347',
  warningLight: '#FFE0A3',
  danger: '#FF5C5C',
  dangerLight: '#FFB3B3',
  background: '#F8F9FF',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  card: '#FFFFFF',
  text: '#1A1A2E',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  tabBar: '#FFFFFF',
  statusBar: 'dark',
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
};

const darkColors: ThemeColors = {
  primary: '#8B84FF',
  primaryLight: '#6C63FF',
  primaryDark: '#4A42CC',
  accent: '#FF6584',
  success: '#43D98F',
  successLight: '#1A3D2E',
  warning: '#FFB347',
  warningLight: '#3D2E0A',
  danger: '#FF6B6B',
  dangerLight: '#3D1A1A',
  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceElevated: '#22223A',
  card: '#1E1E32',
  text: '#F1F1FF',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  border: '#2D2D45',
  borderLight: '#252538',
  tabBar: '#1A1A2E',
  statusBar: 'light',
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
};

// Child mode uses bigger, more colorful, playful design
const childColors: ThemeColors = {
  ...lightColors,
  primary: '#FF6B9D',
  primaryLight: '#FFB3D1',
  primaryDark: '#CC4477',
  accent: '#6C63FF',
  background: '#FFF5FF',
  surface: '#FFFFFF',
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
  const systemScheme = useColorScheme();
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
    ? childColors
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
