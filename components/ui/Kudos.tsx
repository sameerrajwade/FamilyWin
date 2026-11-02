/**
 * components/ui/Kudos.tsx — kudos stickers (engagement, user-approved 2026-11-01)
 * ─────────────────────────────────────────────────────────────────────────────
 * Praise for effort, never points. A parent taps a sticker (after approving a
 * claim, or from a kid's profile); the kid sees it on Today and collects it in
 * their sticker book.
 *   <StickerPicker onPick={…} />      six 3D stickers in a row
 *   <KudosToast memberId />            newest sticker for this player (Today)
 *   <StickerBook memberId />           counts + latest stickers (profile)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/store';
import { useTheme, type ThemeColors } from '@/lib/theme';
import { KUDOS_STICKERS, type KudosSticker, type KudosDoc } from '@/lib/firebase';
import { firestore } from '@/lib/fb';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { FontFamily, FontSize, Spacing, BorderRadius } from '@/constants/theme';

/** Live kudos for one member, newest first. */
export function useKudos(memberId?: string | null): KudosDoc[] {
  const { family } = useAuthStore();
  const [list, setList] = useState<KudosDoc[]>([]);
  useEffect(() => {
    if (!family?.id || !memberId) { setList([]); return; }
    const unsub = firestore().collection('families').doc(family.id).collection('kudos')
      .where('memberId', '==', memberId)
      .onSnapshot(
        (snap: any) => setList(snap.docs
          .map((d: any) => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))),
        () => {},
      );
    return () => unsub();
  }, [family?.id, memberId]);
  return list;
}

export function StickerPicker({ onPick, size = 34, disabled }: { onPick: (s: KudosSticker) => void; size?: number; disabled?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {KUDOS_STICKERS.map((s) => (
        <TouchableOpacity key={s} disabled={disabled} hitSlop={4}
          onPress={() => { Haptics.selectionAsync().catch(() => {}); onPick(s); }}
          accessibilityRole="button" accessibilityLabel={`Send a ${s} sticker`}>
          <EmojiIcon emoji={s} size={size} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const SEEN_KEY = (memberId: string) => `kudos_seen_${memberId}`;
const TOAST_WINDOW_MS = 2 * 86_400_000;

/** The newest sticker for this player (last 2 days), until they close it. */
export function KudosToast({ memberId, style }: { memberId?: string | null; style?: any }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const list = useKudos(memberId);
  const [seenId, setSeenId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!memberId) return;
    AsyncStorage.getItem(SEEN_KEY(memberId)).then((v) => setSeenId(v)).catch(() => setSeenId(null));
  }, [memberId]);
  const k = list[0];
  if (!memberId || seenId === undefined || !k || k.id === seenId) return null;
  const at = k.createdAt?.toMillis?.() ?? Date.now();
  if (Date.now() - at > TOAST_WINDOW_MS) return null;
  const close = () => { setSeenId(k.id); AsyncStorage.setItem(SEEN_KEY(memberId), k.id).catch(() => {}); };
  return (
    <View style={[styles.toast, style]} accessibilityLabel={`${k.fromName} sent you a sticker`}>
      <EmojiIcon emoji={k.emoji} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={styles.eyebrow}>STICKER FROM {k.fromName.toUpperCase()}</Text>
        <Text style={styles.title}>{k.taskTitle ? `For “${k.taskTitle}”. Nice work!` : 'Just because you’re awesome!'}</Text>
      </View>
      <TouchableOpacity onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close sticker">
        <Text style={styles.close}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Sticker book on a profile: how many of each, and the latest few. */
export function StickerBook({ memberId, name }: { memberId?: string | null; name?: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const list = useKudos(memberId);
  const counts = KUDOS_STICKERS.map((s) => ({ s, n: list.filter((k) => k.emoji === s).length }));
  return (
    <View style={styles.book}>
      <Text style={styles.bookTitle}>Sticker book</Text>
      {list.length === 0 ? (
        <Text style={styles.empty}>{name ? `${name} has no stickers yet.` : 'No stickers yet.'} Grown-ups send them for great effort.</Text>
      ) : (
        <>
          <View style={styles.counts}>
            {counts.map(({ s, n }) => (
              <View key={s} style={[styles.countItem, n === 0 && { opacity: 0.3 }]} accessibilityLabel={`${n} ${s} stickers`}>
                <EmojiIcon emoji={s} size={30} />
                <Text style={styles.countN}>×{n}</Text>
              </View>
            ))}
          </View>
          {list.slice(0, 3).map((k) => (
            <Text key={k.id} style={styles.line} numberOfLines={1}>
              {k.emoji} from {k.fromName}{k.taskTitle ? ` · ${k.taskTitle}` : ''}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    toast: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: colors.primary + '40', padding: Spacing.md },
    eyebrow: { fontSize: 10, fontFamily: FontFamily.extraBold, letterSpacing: 1, color: colors.textAccent },
    title: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.text },
    close: { fontSize: 18, fontFamily: FontFamily.bold, color: colors.textMuted, paddingHorizontal: 4 },
    book: { gap: Spacing.sm },
    bookTitle: { fontSize: FontSize.md, fontFamily: FontFamily.extraBold, color: colors.text },
    empty: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: colors.textSecondary },
    counts: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
    countItem: { alignItems: 'center', minWidth: 40 },
    countN: { fontSize: FontSize.xs, fontFamily: FontFamily.extraBold, color: colors.textSecondary },
    line: { fontSize: FontSize.sm, fontFamily: FontFamily.semiBold, color: colors.textSecondary },
  });
}
