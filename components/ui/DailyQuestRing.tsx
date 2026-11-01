/**
 * components/ui/DailyQuestRing.tsx — today's quest ring (Phase E1)
 * ─────────────────────────────────────────────────────────────────────────────
 * A small progress ring beside the Today greeting: how close this person is to
 * today's surprise pack. Purple arc = done and approved; amber arc = claimed,
 * waiting for a parent OK; the gift in the middle turns into a coin bag once
 * every task is approved. Progress comes from lib/surprisePacks::questProgress
 * so the ring and the pack always agree on what "done" means.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useTheme } from '@/lib/theme';
import { EmojiIcon } from '@/components/ui/EmojiIcon';
import { ProgressRing } from '@/components/ui/ProgressRing';
import type { QuestProgress } from '@/lib/surprisePacks';

export function DailyQuestRing({ progress, size = 46 }: { progress: QuestProgress; size?: number }) {
  const { colors } = useTheme();
  const total = Math.max(1, progress.total);
  return (
    <ProgressRing
      size={size}
      segments={[
        { value: progress.approved / total, color: progress.complete ? colors.success : colors.primary },
        { value: progress.pending / total, color: colors.warning },
      ]}
      accessibilityLabel={
        progress.complete
          ? 'Surprise pack earned today'
          : `${progress.approved} of ${progress.total} tasks approved today${progress.pending ? `, ${progress.pending} waiting for an OK` : ''}`
      }
    >
      <EmojiIcon emoji={progress.complete ? '💰' : '🎁'} size={size * 0.46} />
    </ProgressRing>
  );
}
