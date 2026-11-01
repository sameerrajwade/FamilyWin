import { useEffect, useRef } from 'react';
import { Tabs, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Colors, FontFamily, FontSize } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { Icon, IconName } from '@/components/ui/Icon';
import { useAuthStore, useFamilyStore } from '@/store';
import { firestore } from '@/lib/fb';
import { Col, getNotifConfig, penaltyPauseActive } from '@/lib/firebase';
import { getCurrentWeekRange } from '@/lib/pointsEngine';
import { competitors, shouldShowCrowning } from '@/lib/familyGame';
import { dateKeyOf } from '@/lib/surprisePacks';
import { useMemberLevels } from '@/lib/memberLevels';
import { ensureReminders, pauseReminders } from '@/lib/notifications';
import { useReminderStatus } from '@/lib/reminderStatus';
import { useKidMode } from '@/lib/kidMode';

interface TabIconProps {
  icon: IconName;
  iconActive: IconName;
  label: string;
  focused: boolean;
}

function TabIcon({ icon, iconActive, label, focused }: TabIconProps) {
  const { colors } = useTheme();
  const tint = focused ? colors.primary : colors.textMuted;
  return (
    <View style={styles.tabItem}>
      <Icon name={focused ? iconActive : icon} size={23} color={tint} />
      <Text numberOfLines={1} style={[styles.tabLabel, { color: tint }]}>{label}</Text>
    </View>
  );
}

export default function AppTabsLayout() {
  const { colors } = useTheme();
  const { member, family } = useAuthStore();
  const setMembers = useFamilyStore((s) => s.setMembers);

  // ── Phase 4 read-minimization ──────────────────────────────────────────────
  // ONE family-wide members listener for the whole app session, mounted here so
  // it outlives individual tabs. Every screen reads members from the Zustand
  // store instead of re-fetching getFamilyMembers on each focus (which used to
  // fire a full members read on every Tasks/Scores/Insights/Rewards visit).
  // onSnapshot is served cache-first and only re-delivers on an actual change.
  useEffect(() => {
    if (!family?.id) return;
    const unsub = firestore()
      .collection('families').doc(family.id).collection('members')
      .onSnapshot(
        (snap: any) => {
          setMembers(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as any);
        },
        (err: any) => { if (__DEV__) console.error('[members listener]', err); },
      );
    return () => unsub();
  }, [family?.id, setMembers]);

  // E3: everyone's lifetime level for the avatar frames (one listener app-wide).
  useEffect(() => {
    if (!family?.id) return;
    const { setFromTransactions, reset } = useMemberLevels.getState();
    reset();
    const unsub = Col.transactions(family.id).onSnapshot(
      (snap) => setFromTransactions(snap.docs.map((d) => d.data() as any)),
      (err) => { if (__DEV__) console.error('[levels listener]', err); },
    );
    return () => unsub();
  }, [family?.id]);

  // ALWAYS-ON reminders for the account holder (morning plan for parents,
  // evening check-in for everyone). Runs on every launch so existing users who
  // onboarded before reminders existed get them too, and asks for notification
  // permission if the OS still allows asking (Android 13+ needs it, and the old
  // code never asked on launch, so those reminders silently never showed).
  // There is no on/off switch: the legacy `enabled` flag is ignored on purpose.
  // Kid Mode survives restarts: if the phone was handed to a kid, reopen
  // straight into Kid Mode (stacked on the tabs so exiting returns here).
  const kidModeActive = useKidMode((s) => s.active);
  useEffect(() => {
    if (kidModeActive) router.push('/app/kid-mode' as any);
    // Only on mount — entering Kid Mode later navigates explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sunday crowning ceremony (E5): on the first launch of a new week, open last
  // week's winner screen once per device — only early in the week, only if
  // someone actually won, and never on top of Kid Mode.
  const members = useFamilyStore((s) => s.members);
  const crowningChecked = useRef(false);
  useEffect(() => {
    if (crowningChecked.current || kidModeActive || !family?.id || !members.length) return;
    crowningChecked.current = true;
    (async () => {
      try {
        const weekStartDay = family.weekStartDay ?? 1;
        const { start } = getCurrentWeekRange(weekStartDay);
        const thisWeekKey = dateKeyOf(start);
        const key = `crowning_seen_${family.id}`;
        const seenWeekKey = await AsyncStorage.getItem(key);
        const daysIntoWeek = Math.floor((Date.now() - start.getTime()) / 86_400_000);
        if (seenWeekKey === thisWeekKey || daysIntoWeek >= 3) return;

        const lastStart = new Date(start); lastStart.setDate(lastStart.getDate() - 7);
        const snap = await Col.transactions(family.id)
          .where('createdAt', '>=', firestore.Timestamp.fromDate(lastStart))
          .where('createdAt', '<', firestore.Timestamp.fromDate(start))
          .get();
        const players = new Set(competitors(members as any[], family.competitionMode).map((m: any) => m.id));
        const totals: Record<string, number> = {};
        for (const d of snap.docs) {
          const t = d.data();
          if (t.source === 'redemption' || !players.has(t.memberId)) continue;
          totals[t.memberId] = (totals[t.memberId] ?? 0) + (t.delta ?? 0);
        }
        const lastWeekHadChampion = Object.values(totals).some((v) => v > 0);

        if (shouldShowCrowning({ seenWeekKey, thisWeekKey, daysIntoWeek, lastWeekHadChampion })) {
          await AsyncStorage.setItem(key, thisWeekKey);
          router.push('/app/winner' as any);
        }
      } catch { /* best-effort: the Scores tab banner still links to it */ }
    })();
  }, [family?.id, family?.weekStartDay, family?.competitionMode, members, kidModeActive]);

  const setReminderPermission = useReminderStatus((s) => s.setPermission);
  useEffect(() => {
    if (!member?.id || !family?.id) return;
    let cancelled = false;
    (async () => {
      try {
        // Vacation/sick hold mutes the reminders — no nagging while away.
        if (penaltyPauseActive(family, member)) {
          await pauseReminders();
          return;
        }
        const cfg: any = await getNotifConfig(family.id, member.id);
        if (cancelled) return;
        const permission = await ensureReminders({
          name: member.displayName,
          isParent: member.role === 'parent' || member.role === 'admin_parent',
          morning: cfg?.morningReminderTime,
          evening: cfg?.dailyReminderTime,
          quiet: { start: cfg?.quietStart, end: cfg?.quietEnd },
          prompt: true,
          weekStartDay: family.weekStartDay ?? 1,
          // G4: each person can switch any reminder type off (default on).
          off: { morning: cfg?.morningOff === true, evening: cfg?.eveningOff === true, report: cfg?.reportOff === true },
        });
        if (!cancelled) setReminderPermission(permission);
      } catch { /* best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [member?.id, member?.role, family?.id, family?.weekStartDay, member?.displayName, family?.penaltyPausedUntil, member?.penaltyPausedUntil, setReminderPermission]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, { backgroundColor: colors.tabBar, borderTopColor: colors.border }],
        tabBarShowLabel: false,
        tabBarItemStyle: styles.tabBarItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="list-outline" iconActive="list" label="Today" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="trophy-outline" iconActive="trophy" label="Scores" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="gift-outline" iconActive="gift" label="Rewards" focused={focused} />
          ),
        }}
      />
      {/* Family = people + the game (members, approvals, report, setup, rules).
          It replaces the old Insights tab, whose overlap with Scores confused. */}
      <Tabs.Screen
        name="family"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="people-outline" iconActive="people" label="Family" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="settings-outline" iconActive="settings" label="Settings" focused={focused} />
          ),
        }}
      />
      {/* Points history (old Insights) — no tab of its own; opened from
          Family → Points history. */}
      <Tabs.Screen name="history" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F8',
    height: Platform.OS === 'android' ? 68 : 88,
    paddingBottom: Platform.OS === 'android' ? 10 : 26,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  tabBarItem: {
    paddingHorizontal: 2,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    width: 60,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: FontFamily.bold,
    color: Colors.textMuted,
    marginTop: 3,
    textAlign: 'center',
  },
});
