/**
 * lib/nudgeStore.ts — per-device memory for the gentle asks (lib/nudges) and
 * the "Enjoying Chore League?" review prompt.
 *
 *   maybeAskForReview() — call ONLY at a happy moment (perfect day, a won week,
 *   an approved reward). Yes → the Play in-app review sheet (Google decides if
 *   it actually shows); Not really → a feedback email; Later → asks again in
 *   30+ days, 3 asks max.
 */
import { Alert, Linking } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { APP_STORE_URL, SUPPORT_EMAIL } from '@/constants/strings';
import {
  countOpen, shouldAskForReview, recordReviewAnswer, snoozeInvite, neverInvite,
  type InviteNudgeState, type ReviewState,
} from '@/lib/nudges';

interface NudgeStore {
  firstSeenAt: number | null;
  invite: InviteNudgeState;
  review: ReviewState;
  appOpened: () => void;
  snoozeInvite: () => void;
  neverInvite: () => void;
  answerReview: (a: 'love' | 'meh' | 'later') => void;
}

export const useNudges = create<NudgeStore>()(
  persist(
    (set, get) => ({
      firstSeenAt: null,
      invite: {},
      review: {},
      appOpened: () => set({ firstSeenAt: get().firstSeenAt ?? Date.now(), review: countOpen(get().review) }),
      snoozeInvite: () => set({ invite: snoozeInvite(get().invite) }),
      neverInvite: () => set({ invite: neverInvite(get().invite) }),
      answerReview: (a) => set({ review: recordReviewAnswer(get().review, a) }),
    }),
    { name: 'nudges', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

/** Opens a pre-filled feedback email. */
export function sendFeedback(subject = 'Chore League feedback') {
  Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`).catch(() => {});
}

/** The Play in-app review sheet, or the store page if it's unavailable. */
export async function rateApp() {
  try {
    if (await StoreReview.hasAction()) await StoreReview.requestReview();
    else await Linking.openURL(APP_STORE_URL);
  } catch { /* nothing to surface */ }
}

/** Show "Enjoying Chore League?" if the rules allow it right now. */
export function maybeAskForReview(): boolean {
  const { review, answerReview } = useNudges.getState();
  if (!shouldAskForReview(review)) return false;
  // Android caps Alert at 3 buttons — exactly 3 here.
  Alert.alert('Enjoying Chore League?', 'A quick rating helps other families find the game.', [
    { text: 'Later', style: 'cancel', onPress: () => answerReview('later') },
    {
      text: 'Not really',
      onPress: () => {
        answerReview('meh');
        Alert.alert('Help us fix it', 'What should be better? One line is plenty.', [
          { text: 'Skip', style: 'cancel' },
          { text: 'Send feedback', onPress: () => sendFeedback('What would make Chore League better') },
        ]);
      },
    },
    {
      text: 'Love it ⭐',
      onPress: () => { answerReview('love'); rateApp(); },
    },
  ]);
  return true;
}
