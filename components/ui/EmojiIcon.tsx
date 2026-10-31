/**
 * components/ui/EmojiIcon.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders an emoji as its bundled Fluent 3D image (lib/emojiAssets) so icons
 * look the same — and premium — on every phone. Falls back to the plain emoji
 * glyph for anything we don't ship an image for (e.g. a parent typing a custom
 * emoji), sized to match.
 *
 *   <EmojiIcon emoji="🧘" size={28} />
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Image, Text, type ImageStyle, type StyleProp } from 'react-native';
import { emojiImage } from '@/lib/emojiAssets';

interface EmojiIconProps {
  emoji: string | null | undefined;
  /** Rendered box size in dp (the image is square). */
  size?: number;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}

export function EmojiIcon({ emoji, size = 24, style, accessibilityLabel }: EmojiIconProps) {
  const src = emojiImage(emoji);
  if (src) {
    return (
      <Image
        source={src}
        style={[{ width: size, height: size }, style]}
        resizeMode="contain"
        accessibilityLabel={accessibilityLabel}
        accessibilityIgnoresInvertColors
      />
    );
  }
  // Glyph fallback — emoji fonts draw a little smaller than their em box.
  return (
    <Text
      style={{ fontSize: size * 0.82, lineHeight: size, textAlign: 'center', width: size }}
      accessibilityLabel={accessibilityLabel}
      allowFontScaling={false}
    >
      {emoji ?? ''}
    </Text>
  );
}
