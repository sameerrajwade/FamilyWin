/**
 * components/ui/ShareCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Branded, shareable image cards — the app's growth/branding asset. A single
 * reusable card + a modal that previews it and shares it as a PNG.
 *
 * Every card answers "what is this?" for someone who has never heard of us:
 * the Chore League wordmark + "the family chore game" line sit on top, the
 * week gives the context (never the family name — privacy), and the footer is a challenge
 * ("Think your family can beat us?") with where to get the app.
 *
 * Each share MOMENT (win, standings, streak, recap, level-up, reward, perfect
 * day, invite) passes a `ShareCardData`: a `theme` (gradient + glow), a 3D
 * `hero` emoji, the headline, stat tiles and — for the race cards — the live
 * standings, so "leading" always shows WHAT is being led.
 *
 * Pipeline: render the card in the preview modal → `captureRef` (react-native-
 * view-shot) snapshots that exact view to a temp PNG → `expo-sharing` opens the
 * OS share sheet. Falls back to a text share (with the store link) if the image
 * sharing service is unavailable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Share, ScrollView, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontFamily, FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { APP_STORE_URL, STORE_TAGLINE } from '@/constants/strings';
import { BrandIcon, Brand, type BrandIconName } from '@/components/ui/BrandIcons';
import { EmojiIcon } from '@/components/ui/EmojiIcon';

export interface ShareCardStat { value: string; label: string }
export interface ShareCardRow { name: string; points: number; emoji?: string | null; highlight?: boolean }

export type ShareCardTheme = 'win' | 'race' | 'streak' | 'level' | 'reward' | 'recap' | 'perfect' | 'invite';

export interface ShareCardData {
  /** Contextual brand mark — used as the hero when no `hero` emoji is given. */
  icon: BrandIconName;
  /** Big 3D emoji at the centre of the card (🏆, 🔥, ⭐ …). */
  hero?: string;
  /** Gradient + glow. Defaults to the brand purple. */
  theme?: ShareCardTheme;
  /** Small uppercase chip, e.g. "WIN OF THE WEEK". */
  eyebrow?: string;
  /** Context line under the wordmark, e.g. "The family chore game · Oct 27 – Nov 2". Never the family name. */
  context?: string;
  /** The headline, e.g. "Sameer won the week!". */
  title: string;
  subtitle?: string;
  /** Up to ~3 big stat tiles (points, streak, tasks…). */
  stats?: ShareCardStat[];
  /** Live standings for race/win cards (top 3 shown). */
  standings?: ShareCardRow[];
  /** Footer challenge line. */
  cta?: string;
  /** Text used for the fallback text-share (image share needs no message). */
  shareMessage?: string;
}

const THEMES: Record<ShareCardTheme, { colors: [string, string, string]; glow: string; chip: string }> = {
  win:     { colors: ['#8078FF', Brand.purple, Brand.purpleDark], glow: Brand.gold,        chip: Brand.gold },
  race:    { colors: ['#8078FF', Brand.purple, Brand.purpleDark], glow: Brand.orangeLight, chip: Brand.orangeLight },
  streak:  { colors: [Brand.orange, '#C9468A', Brand.purpleDark], glow: Brand.goldLid,     chip: Brand.goldHi },
  level:   { colors: [Brand.purpleLight, Brand.purple, Brand.purpleDark], glow: Brand.goldHi, chip: Brand.goldLid },
  reward:  { colors: [Brand.purple, '#9A4FD0', Brand.orange], glow: Brand.goldHi,          chip: Brand.goldHi },
  recap:   { colors: [Brand.purpleLight, Brand.purple, Brand.purpleDark], glow: Brand.orangeLight, chip: Brand.orangeLight },
  perfect: { colors: [Brand.purple, Brand.purpleDark, '#2E2880'], glow: Brand.gold,        chip: Brand.gold },
  invite:  { colors: [Brand.purple, '#9A4FD0', Brand.orange], glow: Brand.goldHi,          chip: Brand.goldHi },
};

const MEDALS = ['🥇', '🥈', '🥉'];
const DEFAULT_CTA = 'Think your family can beat us?';

// Static confetti — position (fractions of the card), size, colour, angle.
const CONFETTI: [x: number, y: number, w: number, h: number, c: string, r: number][] = [
  [0.08, 0.17, 10, 4, Brand.gold, -20], [0.86, 0.14, 8, 8, Brand.orangeLight, 0],
  [0.14, 0.34, 6, 6, '#FFFFFF', 0], [0.9, 0.3, 12, 4, Brand.goldLid, 35],
  [0.04, 0.48, 9, 4, Brand.orangeLight, 60], [0.94, 0.46, 6, 6, Brand.gold, 0],
  [0.3, 0.46, 5, 5, Brand.goldHi, 0], [0.72, 0.1, 10, 4, '#FFFFFF', -40],
];

/**
 * Context line: "The family chore game · Oct 27 – Nov 2".
 * PRIVACY (user rule 2026-11-01): share cards never name the family — they go
 * to people outside it. Only first names of the top 3 ever appear.
 */
export function shareContext(when?: string | null): string {
  return when ? `The family chore game · ${when}` : 'The family chore game';
}

/** Max rows on a shared card — top 3 only, never the whole family. */
export const SHARE_TOP_N = 3;

/** Leaderboard entries → card standings rows: top 3, first names only, highlight one id. */
export function standingsRows(
  entries: { memberId: string; displayName: string; avatarEmoji?: string | null; points: number }[],
  highlightId?: string | null,
): ShareCardRow[] {
  return entries.slice(0, SHARE_TOP_N).map((e) => ({
    name: e.displayName.split(' ')[0], points: e.points, emoji: e.avatarEmoji, highlight: e.memberId === highlightId,
  }));
}

/** The capturable branded card. Rendered inside the preview modal. */
export function ShareCardBody({ data, width = 340 }: { data: ShareCardData; width?: number }) {
  const t = THEMES[data.theme ?? 'race'];
  const rows = (data.standings ?? []).slice(0, SHARE_TOP_N);
  return (
    <LinearGradient colors={t.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, { width }]}>
      {CONFETTI.map(([x, y, w, h, c, r], i) => (
        <View key={i} pointerEvents="none" style={{
          position: 'absolute', left: x * width, top: y * width * 1.4, width: w, height: h,
          borderRadius: w === h ? w / 2 : 2, backgroundColor: c, opacity: 0.85, transform: [{ rotate: `${r}deg` }],
        }} />
      ))}

      {/* Brand + what this is */}
      <View style={styles.topRow}>
        <View style={styles.wordRow}>
          <BrandIcon name="chest" size={26} sparkle={false} />
          <Text style={styles.word}>
            <Text style={{ color: '#FFFFFF' }}>Chore</Text>
            <Text style={{ color: Brand.goldLid }}> League</Text>
          </Text>
        </View>
        {data.eyebrow ? (
          <View style={[styles.chip, { backgroundColor: t.chip }]}>
            <Text style={styles.chipText} numberOfLines={1}>{data.eyebrow}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.context} numberOfLines={1}>{data.context ?? 'The family chore game'}</Text>

      {/* Hero */}
      <View style={styles.heroWrap}>
        <View style={[styles.glowOuter, { backgroundColor: t.glow + '26' }]} />
        <View style={[styles.glowInner, { backgroundColor: t.glow + '40' }]} />
        {data.hero ? <EmojiIcon emoji={data.hero} size={104} /> : <BrandIcon name={data.icon} size={92} />}
      </View>

      <Text style={styles.title}>{data.title}</Text>
      {data.subtitle ? <Text style={styles.subtitle}>{data.subtitle}</Text> : null}

      {data.stats && data.stats.length > 0 && (
        <View style={styles.statRow}>
          {data.stats.map((s, i) => (
            <View key={i} style={styles.statTile}>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      {rows.length > 0 && (
        <View style={styles.board}>
          {rows.map((r, i) => (
            <View key={i} style={[styles.boardRow, r.highlight && styles.boardRowHi]}>
              <View style={styles.boardRank}>
                {i < 3 ? <EmojiIcon emoji={MEDALS[i]} size={22} /> : <Text style={styles.boardRankText}>{i + 1}</Text>}
              </View>
              {r.emoji ? <EmojiIcon emoji={r.emoji} size={22} /> : null}
              <Text style={styles.boardName} numberOfLines={1}>{r.name}</Text>
              <Text style={styles.boardPts}>{r.points} pts</Text>
            </View>
          ))}
        </View>
      )}

      {/* Challenge footer */}
      <View style={styles.footer}>
        <Text style={styles.cta}>{data.cta ?? DEFAULT_CTA}</Text>
        <Text style={styles.store}>Chore League · {STORE_TAGLINE}</Text>
      </View>
    </LinearGradient>
  );
}

export function ShareCardModal({ visible, data, onClose }: {
  visible: boolean;
  data: ShareCardData | null;
  onClose: () => void;
}) {
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const cardW = Math.min(340, screenW - 32);

  async function handleShare() {
    if (!data) return;
    try {
      setBusy(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // Snapshot the exact previewed card at 3× for a crisp social image.
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile', ...( { pixelRatio: 3 } as any) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share from Chore League' });
      } else {
        await Share.share({ message: `${data.shareMessage ?? data.title}\n\n${STORE_TAGLINE}: ${APP_STORE_URL}` });
      }
    } catch { /* user dismissed / capture failed — nothing to surface */ }
    finally { setBusy(false); }
  }

  if (!data) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.overlay}>
        {/* flexGrow + insets: the whole card sits centred below the status bar
            (it used to hug the top edge, hiding the card's header). */}
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.previewHint}>This is the picture you'll share</Text>
          {/* Ref'd wrapper is what gets captured (buttons stay outside it). */}
          <View ref={cardRef} collapsable={false} style={styles.captureWrap}>
            <ShareCardBody data={data} width={cardW} />
          </View>

          <View style={[styles.actions, { width: cardW }]}>
            <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={onClose} disabled={busy}>
              <Text style={styles.cancelText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.shareBtn]} onPress={handleShare} disabled={busy}>
              {busy ? <ActivityIndicator color={Brand.purpleDark} /> : <Text style={styles.shareText}>Share</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(10,8,20,0.86)' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  previewHint: { fontFamily: FontFamily.semiBold, fontSize: 12, color: '#FFFFFF99', marginBottom: Spacing.sm },
  captureWrap: { borderRadius: 28, overflow: 'hidden' },
  card: { borderRadius: 28, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md, alignItems: 'center', overflow: 'hidden' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  wordRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }, // wordmark never wraps; the chip yields
  word: { fontFamily: FontFamily.black, fontSize: 19, letterSpacing: -0.5 },
  chip: { borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4, maxWidth: '52%' },
  chipText: { fontFamily: FontFamily.black, fontSize: 10, letterSpacing: 1.2, color: Brand.purpleDark },
  context: { alignSelf: 'flex-start', fontFamily: FontFamily.semiBold, fontSize: 12, color: '#FFFFFFB8', marginTop: 4 },
  heroWrap: { width: 170, height: 150, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm },
  glowOuter: { position: 'absolute', width: 160, height: 160, borderRadius: 80 },
  glowInner: { position: 'absolute', width: 112, height: 112, borderRadius: 56 },
  title: { fontFamily: FontFamily.black, fontSize: 28, lineHeight: 32, color: '#FFFFFF', textAlign: 'center' },
  subtitle: { fontFamily: FontFamily.semiBold, fontSize: FontSize.sm, color: '#FFFFFFD0', textAlign: 'center', marginTop: 6 },
  statRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  statTile: {
    backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, alignItems: 'center', minWidth: 84,
  },
  statValue: { fontFamily: FontFamily.black, fontSize: 24, color: '#FFFFFF' },
  statLabel: { fontFamily: FontFamily.bold, fontSize: 11, color: '#FFFFFFB8', marginTop: 1 },
  board: { width: '100%', marginTop: Spacing.lg, gap: 6 },
  boardRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.10)', paddingHorizontal: 10, paddingVertical: 7,
  },
  boardRowHi: { backgroundColor: 'rgba(255,255,255,0.24)', borderWidth: 1, borderColor: Brand.goldLid },
  boardRank: { width: 24, alignItems: 'center' },
  boardRankText: { fontFamily: FontFamily.black, fontSize: 14, color: '#FFFFFFB8' },
  boardName: { flex: 1, fontFamily: FontFamily.bold, fontSize: 15, color: '#FFFFFF' },
  boardPts: { fontFamily: FontFamily.black, fontSize: 14, color: Brand.goldHi },
  footer: {
    marginTop: Spacing.lg, width: '100%', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg, paddingVertical: 10, paddingHorizontal: Spacing.md,
  },
  cta: { fontFamily: FontFamily.black, fontSize: 15, color: Brand.purpleDark, textAlign: 'center' },
  store: { fontFamily: FontFamily.bold, fontSize: 11, color: Brand.purple, marginTop: 2 },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  btn: { flex: 1, borderRadius: BorderRadius.md, paddingVertical: 15, alignItems: 'center' },
  cancelBtn: { borderWidth: 1.5, borderColor: '#FFFFFF55' },
  cancelText: { fontFamily: FontFamily.bold, fontSize: FontSize.md, color: '#FFFFFF' },
  shareBtn: { backgroundColor: '#FFFFFF' },
  shareText: { fontFamily: FontFamily.bold, fontSize: FontSize.md, color: Brand.purpleDark },
});
