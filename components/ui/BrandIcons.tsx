/**
 * components/ui/BrandIcons.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Chore League brand icon FAMILY — one shared visual language (purple + gold),
 * used two ways:
 *   • the master brand mark (treasure chest) for app identity, and
 *   • a set of contextual marks the share cards pick from by moment
 *     (win → podium, streak → medal, recap/reward → coin, level-up → shield…).
 *
 * All marks are vector (react-native-svg), draw gold-on-transparent in a
 * 120×120 viewBox, and size via a single `size` prop. `<AppIconTile>` wraps a
 * mark in the purple rounded-square app-icon lockup. `<Wordmark>` / `<BrandLogo>`
 * render the two-tone "Chore League" wordmark + tagline.
 *
 * Solid fills (not SVG gradients) are used deliberately — gradient ids collide
 * across multiple <Svg> instances in react-native-svg, and solids read just as
 * well at these sizes. The purple app-icon background uses expo-linear-gradient.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { View, Text, StyleSheet, Image, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Rect, Circle, G } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontFamily } from '@/constants/theme';

// ── Brand palette (gold ramp for the marks) ─────────────────────────────────
export const Brand = {
  purple: Colors.primary, // #6C63FF
  purpleDark: Colors.primaryDark, // #4A42CC
  purpleLight: Colors.primaryLight, // #9D97FF
  orange: '#FF6B2C',
  orangeLight: Colors.accentLight ?? '#FFB088',
  goldHi: '#FFF3CF',
  gold: '#FFC400',
  goldLid: '#FFD84D',
  goldMid: '#E9A400',
  goldDeep: '#C88600',
  goldShadow: '#B87400',
  tagline: 'Do chores. Win the week.', // user pick 2026-11-01 (tagline C)
} as const;

export type BrandIconName = 'chest' | 'coin' | 'shield' | 'podium' | 'medal' | 'trophy';

// A 5-point star path centred on (0,0), outer R=20 / inner r=8. Placed via <G>.
const STAR5 = 'M0,-20 L4.7,-6.5 L19,-6.18 L7.6,2.47 L11.76,16.18 L0,8 L-11.76,16.18 L-7.6,2.47 L-19,-6.18 L-4.7,-6.5 Z';

function Star({ cx, cy, scale = 1, fill }: { cx: number; cy: number; scale?: number; fill: string }) {
  // Explicit transform string: translate first, then scale about the star's
  // own (0,0) centre — avoids react-native-svg's ambiguous x/scale ordering.
  return (
    <G transform={`translate(${cx} ${cy}) scale(${scale})`}>
      <Path d={STAR5} fill={fill} />
    </G>
  );
}

interface MarkProps {
  /** Rendered pixel size (square). Default 48. */
  size?: number;
  /** Draw a small sparkle accent (default true for the chest/coin). */
  sparkle?: boolean;
}

function Frame({ size = 48, children }: { size?: number; children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      {children}
    </Svg>
  );
}

// ── Treasure chest (master brand mark) ──────────────────────────────────────
// The glossy 3D crowned chest picked by the user on 2026-11-01 ("icon A"). One
// source drawing (scripts/brand/chest-a.svgfrag) renders the app icon, splash
// and this in-app image via scripts/brand/render-icons.js. A PNG (not SVG)
// because its gradients + soft highlights need blur filters react-native-svg
// can't draw. `sparkle` is kept for call-site compatibility.
const CHEST_3D = require('../../assets/brand/chest-3d.png');
export function ChestMark({ size = 48 }: MarkProps) {
  return <Image source={CHEST_3D} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />;
}

// ── Coin & star (points / reward / recap) ───────────────────────────────────
export function CoinMark({ size = 48, sparkle = true }: MarkProps) {
  return (
    <Frame size={size}>
      <Circle cx="60" cy="62" r="42" fill={Brand.gold} />
      <Circle cx="60" cy="62" r="42" fill="none" stroke={Brand.goldMid} strokeWidth="3" />
      <Circle cx="60" cy="62" r="33" fill="none" stroke={Brand.goldHi} strokeWidth="2" />
      <Star cx={60} cy={62} fill={Brand.goldShadow} />
      {sparkle && <Path d="M104,20 L107,27 L114,30 L107,33 L104,40 L101,33 L94,30 L101,27 Z" fill={Brand.goldHi} />}
    </Frame>
  );
}

// ── Shield crest (level-up / badge) ─────────────────────────────────────────
export function ShieldMark({ size = 48 }: MarkProps) {
  return (
    <Frame size={size}>
      <Path d="M60,18 L100,32 L100,72 C100,98 80,116 60,124 C40,116 20,98 20,72 L20,32 Z" fill={Brand.gold} />
      <Path d="M60,18 L100,32 L100,72 C100,98 80,116 60,124 C40,116 20,98 20,72 L20,32 Z" fill="none" stroke={Brand.goldMid} strokeWidth="3" />
      <Star cx={60} cy={62} scale={0.85} fill={Brand.goldShadow} />
    </Frame>
  );
}

// ── Winner's podium (win of the week) ───────────────────────────────────────
export function PodiumMark({ size = 48 }: MarkProps) {
  return (
    <Frame size={size}>
      <Star cx={61} cy={30} scale={0.72} fill={Brand.goldHi} />
      <Rect x="24" y="70" width="26" height="42" rx="4" fill={Brand.goldMid} />
      <Rect x="48" y="50" width="26" height="62" rx="4" fill={Brand.gold} />
      <Rect x="72" y="84" width="26" height="28" rx="4" fill={Brand.goldDeep} />
    </Frame>
  );
}

// ── Medal (streak / milestone) ──────────────────────────────────────────────
export function MedalMark({ size = 48 }: MarkProps) {
  return (
    <Frame size={size}>
      <Path d="M48,72 L60,100 L51,112 L41,90 Z" fill={Brand.goldMid} />
      <Path d="M72,72 L79,90 L69,112 L60,100 Z" fill={Brand.goldDeep} />
      <Circle cx="60" cy="52" r="32" fill={Brand.gold} />
      <Circle cx="60" cy="52" r="32" fill="none" stroke={Brand.goldMid} strokeWidth="3" />
      <Star cx={60} cy={52} scale={0.68} fill={Brand.goldShadow} />
    </Frame>
  );
}

// ── Trophy cup (winning) ────────────────────────────────────────────────────
export function TrophyMark({ size = 48 }: MarkProps) {
  return (
    <Frame size={size}>
      <Path d="M36,40 C21,40 21,64 40,61" fill="none" stroke={Brand.gold} strokeWidth="7" />
      <Path d="M84,40 C99,40 99,64 80,61" fill="none" stroke={Brand.gold} strokeWidth="7" />
      <Path d="M36,32 L84,32 L79,62 C79,76 70,86 60,86 C50,86 41,76 41,62 Z" fill={Brand.gold} />
      <Rect x="55" y="85" width="10" height="12" fill={Brand.goldMid} />
      <Rect x="44" y="96" width="32" height="8" rx="3" fill={Brand.goldMid} />
      <Rect x="36" y="104" width="48" height="10" rx="3" fill={Brand.goldDeep} />
      <Star cx={60} cy={54} scale={0.55} fill={Brand.goldShadow} />
    </Frame>
  );
}

// Registry — lets share cards pick a mark by name.
export const BRAND_ICONS: Record<BrandIconName, (p: MarkProps) => React.ReactElement> = {
  chest: ChestMark,
  coin: CoinMark,
  shield: ShieldMark,
  podium: PodiumMark,
  medal: MedalMark,
  trophy: TrophyMark,
};

/** Render any family mark by name (used by the share-card system). */
export function BrandIcon({ name, size = 48, sparkle }: { name: BrandIconName } & MarkProps) {
  const Mark = BRAND_ICONS[name];
  return <Mark size={size} sparkle={sparkle} />;
}

// ── App-icon lockup: a mark inside the purple rounded square ─────────────────
export function AppIconTile({ size = 88, name = 'chest', style }: {
  size?: number;
  name?: BrandIconName;
  style?: StyleProp<ViewStyle>;
}) {
  const radius = size * 0.23;
  return (
    <LinearGradient
      colors={['#7A72FF', Brand.purpleDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <BrandIcon name={name} size={size * 0.74} />
    </LinearGradient>
  );
}

// ── Wordmark: "Chore"(purple) + " League"(gold — matches the chest; user pick 2026-11-01) ──
export function Wordmark({ size = 32, tagline = false, onDark = false }: {
  size?: number;
  tagline?: boolean;
  onDark?: boolean;
}) {
  const loot = onDark ? Brand.purpleLight : Brand.purple;
  const board = onDark ? Brand.goldLid : Brand.goldDeep;
  const tagColor = onDark ? Colors.textSecondaryDark : Colors.textSecondary;
  return (
    <View>
      <Text style={{ fontFamily: FontFamily.black, fontSize: size, letterSpacing: -0.5 }}>
        <Text style={{ color: loot }}>Chore</Text>
        <Text style={{ color: board }}> League</Text>
      </Text>
      {tagline && (
        <Text style={{ fontFamily: FontFamily.semiBold, fontSize: size * 0.4, color: tagColor, marginTop: 2 }}>
          {Brand.tagline}
        </Text>
      )}
    </View>
  );
}

// ── Full brand logo: app-icon tile + wordmark (horizontal or stacked) ────────
export function BrandLogo({ size = 40, tagline = true, stacked = false, onDark = false }: {
  size?: number;
  tagline?: boolean;
  stacked?: boolean;
  onDark?: boolean;
}) {
  const tile = <AppIconTile size={size * 1.5} />;
  const word = <Wordmark size={size} tagline={tagline} onDark={onDark} />;
  if (stacked) {
    return (
      <View style={styles.stacked}>
        {tile}
        <View style={{ height: size * 0.35 }} />
        {word}
      </View>
    );
  }
  return (
    <View style={styles.row}>
      {tile}
      <View style={{ width: size * 0.4 }} />
      {word}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  stacked: { alignItems: 'center' },
});
