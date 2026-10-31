/**
 * components/ui/AvatarPicker.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The ONE avatar picker — used for parents and kids, in onboarding, Settings,
 * Add Child and Edit Member. Every option is drawn in the same <Avatar>
 * container the member will appear in across the app, so what you pick is
 * exactly what you get.
 *
 *   <AvatarPicker value={emoji} onChange={setEmoji} />            // scrolling row
 *   <AvatarPicker value={emoji} onChange={setEmoji} layout="grid" />
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { ScrollView, View, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Avatar } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { AVATAR_EMOJIS, Spacing } from '@/constants/theme';

interface AvatarPickerProps {
  value: string | null | undefined;
  onChange: (emoji: string) => void;
  layout?: 'row' | 'grid';
  size?: number;
}

export function AvatarPicker({ value, onChange, layout = 'row', size = 52 }: AvatarPickerProps) {
  const { colors } = useTheme();

  const options = AVATAR_EMOJIS.map((em) => {
    const selected = value === em;
    return (
      <TouchableOpacity
        key={em}
        onPress={() => { onChange(em); Haptics.selectionAsync().catch(() => {}); }}
        activeOpacity={0.75}
        style={[styles.option, selected && { transform: [{ scale: 1.08 }] }]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`Avatar ${em}`}
      >
        <Avatar emoji={em} size={size} showRing={selected} ringColor={colors.primary} />
      </TouchableOpacity>
    );
  });

  if (layout === 'grid') {
    return <View style={styles.grid}>{options}</View>;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
      {options}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { marginBottom: Spacing.md },
  row: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: 6, paddingHorizontal: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'center', paddingVertical: Spacing.sm },
  option: { padding: 2 },
});
