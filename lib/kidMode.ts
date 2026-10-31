/**
 * lib/kidMode.ts
 * Kid Mode (Phase B, Bet 1): a parent hands their phone to a kid, who sees only
 * their own tasks and taps "I did it!". Claims land as PENDING; points arrive
 * when a parent approves (bulk "Approve all" each evening).
 *
 * Persisted so killing/reopening the app keeps the kid locked in Kid Mode —
 * only the grown-up gate (lib/familyGame makeGateQuestion) can turn it off.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface KidModeState {
  active: boolean;
  /** The kid currently holding the phone (member id). */
  kidId: string | null;
  enter: (kidId: string) => void;
  switchKid: (kidId: string) => void;
  exit: () => void;
}

export const useKidMode = create<KidModeState>()(
  persist(
    (set) => ({
      active: false,
      kidId: null,
      enter: (kidId) => set({ active: true, kidId }),
      switchKid: (kidId) => set({ kidId }),
      exit: () => set({ active: false, kidId: null }),
    }),
    { name: 'kid-mode', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
