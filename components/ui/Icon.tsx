import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

/**
 * Shared icon component — the single source of UI-chrome iconography.
 *
 * We deliberately use a real vector icon set (Ionicons) for UI CHROME (tab bar,
 * buttons, section headers, list rows) instead of OS emoji, which render
 * inconsistently across devices and read as unpolished. Content emoji (avatars,
 * task-category badges, the mascot, celebrations) are intentionally kept — they
 * carry the app's warm, playful family personality.
 *
 * Focused/unfocused pairs use the outline vs filled Ionicons variants.
 */
export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({
  name,
  size = 20,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: ComponentProps<typeof Ionicons>['style'];
}) {
  return <Ionicons name={name} size={size} color={color} style={style} />;
}
