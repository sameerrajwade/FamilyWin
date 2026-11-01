/**
 * components/ui/ShareCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Branded, shareable image cards — the app's growth/branding asset. A single
 * reusable card + a modal that previews it and shares it as a PNG.
 *
 * Each share MOMENT (win, streak, recap, level-up, reward, invite) passes a
 * `ShareCardData` with a CONTEXTUAL brand mark from the icon family; the card
 * chrome, gradient, wordmark and store footer stay identical so every share
 * reads as Chore League.
 *
 * Pipeline: render the card in the preview modal → `captureRef` (react-native-
 * view-shot) snapshots that exact view to a temp PNG → `expo-sharing` opens the
 * OS share sheet. Falls back to a text share (with the store link) if the image
 * sharing service is unavailable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Share, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { APP_STORE_URL, STORE_TAGLINE } from '@/constants/strings';
import { BrandIcon, Brand, type BrandIconName } from '@/components/ui/BrandIcons';

export interface ShareCardStat { value: string; label: string }

export interface ShareCardData {
  /** Contextual mark for this moment (win→podium, streak→medal, …). */
  icon: BrandIconName;
  /** Small uppercase label above the title, e.g. "WIN OF THE WEEK". */
  eyebrow?: string;
  /** The headline, e.g. "Sameer won the week!". */
  title: string;
  subtitle?: string;
  /** Up to ~3 big stat tiles (points, streak, tasks…). */
  stats?: ShareCardStat[];
  /** Text used for the fallback text-share (image share needs no message). */
  shareMessage?: string;
}

const CARD_W = 320;

/** The capturable branded card. Rendered inside the preview modal. */
function ShareCardBody({ data }: { data: ShareCardData }) {
  return (
    <LinearGradient
      colors={['#8078FF', Brand.purple, Brand.purpleDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.iconHalo}>
        <BrandIcon name={data.icon} size={78} />
      </View>

      {data.eyebrow ? <Text style={styles.eyebrow}>{data.eyebrow}</Text> : null}
      <Text style={styles.title}>{data.title}</Text>
      {data.subtitle ? <Text style={styles.subtitle}>{data.subtitle}</Text> : null}

      {data.stats && data.stats.length > 0 && (
        <View style={styles.statRow}>
          {data.stats.map((s, i) => (
            <View key={i} style={styles.statTile}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.footerBrand}>
          <BrandIcon name="chest" size={24} sparkle={false} />
          <Text style={styles.footerWord}>
            <Text style={{ color: Brand.purpleLight }}>Chore</Text>
            <Text style={{ color: Brand.orangeLight }}> League</Text>
          </Text>
        </View>
        <Text style={styles.footerStore}>{STORE_TAGLINE}</Text>
      </View>
    </LinearGradient>
  );
}

export function ShareCardModal({ visible, data, onClose }: {
  visible: boolean;
  data: ShareCardData | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);

  async function handleShare() {
    if (!data) return;
    try {
      setBusy(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // Snapshot the exact previewed card at 3× for a crisp social image.
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile', ...( { pixelRatio: 3 } as any) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share on Chore League' });
      } else {
        await Share.share({ message: `${data.shareMessage ?? data.title}\n\n${STORE_TAGLINE}: ${APP_STORE_URL}` });
      }
    } catch { /* user dismissed / capture failed — nothing to surface */ }
    finally { setBusy(false); }
  }

  if (!data) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Ref'd wrapper is what gets captured (buttons stay outside it). */}
          <View ref={cardRef} collapsable={false}>
            <ShareCardBody data={data} />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.cancelBtn, { borderColor: '#FFFFFF55' }]} onPress={onClose} disabled={busy}>
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
  overlay: { flex: 1, backgroundColor: 'rgba(10,8,20,0.82)', justifyContent: 'center' },
  scroll: { alignItems: 'center', paddingVertical: 40 },
  card: {
    width: CARD_W,
    borderRadius: 28,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  iconHalo: {
    width: 116, height: 116, borderRadius: 58,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  eyebrow: { fontFamily: FontFamily.extraBold, fontSize: 13, letterSpacing: 2, color: '#FFFFFFB0', marginBottom: 6 },
  title: { fontFamily: FontFamily.black, fontSize: 26, lineHeight: 30, color: '#FFFFFF', textAlign: 'center' },
  subtitle: { fontFamily: FontFamily.semiBold, fontSize: FontSize.sm, color: '#FFFFFFCC', textAlign: 'center', marginTop: 8 },
  statRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xl },
  statTile: {
    backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, alignItems: 'center', minWidth: 78,
  },
  statValue: { fontFamily: FontFamily.black, fontSize: 24, color: '#FFFFFF' },
  statLabel: { fontFamily: FontFamily.semiBold, fontSize: 11, color: '#FFFFFFB0', marginTop: 2 },
  footer: {
    marginTop: Spacing.xl, paddingTop: Spacing.lg, borderTopWidth: 1, borderTopColor: '#FFFFFF2A',
    width: '100%', alignItems: 'center',
  },
  footerBrand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerWord: { fontFamily: FontFamily.black, fontSize: 19, letterSpacing: -0.5 },
  footerStore: { fontFamily: FontFamily.semiBold, fontSize: 12, color: '#FFFFFFB0', marginTop: 4 },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xl, width: CARD_W },
  btn: { flex: 1, borderRadius: BorderRadius.md, paddingVertical: 15, alignItems: 'center' },
  cancelBtn: { borderWidth: 1.5 },
  cancelText: { fontFamily: FontFamily.bold, fontSize: FontSize.md, color: '#FFFFFF' },
  shareBtn: { backgroundColor: '#FFFFFF' },
  shareText: { fontFamily: FontFamily.bold, fontSize: FontSize.md, color: Brand.purpleDark },
});
