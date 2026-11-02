import { useEffect, useRef, useState } from 'react';
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
import { competitors, shouldShowCrowning, isKid } from '@/lib/familyGame';
import { checkSurprisePacks } from '@/lib/surprise';
import { dateKeyOf } from '@/lib/surprisePacks';
import { useMemberLevels } from '@/lib/memberLevels';
import { ensureReminders, pauseReminders } from '@/lib/notifications';
import { useReminderStatus } from '@/lib/reminderStatus';
import { useKidMode } from '@/lib/kidMode';
import { useNudges } from '@/lib/nudgeStore';

interface TabIconProps {
  icon: IconName;
  iconActive: IconName;
  label: string;
  focused: boolean;
  badge?: number;
}

function TabIcon({ icon, iconActive, label, focused, badge = 0 }: TabIconProps) {
  const { colors } = useTheme();
  // Icon keeps the brand fill colour; the LABEL is text → textAccent (readable in dark mode).
  const tint = focused ? colors.primary : colors.textMuted;
  const labelTint = focused ? colors.textAccent : colors.textMuted;
  return (
    <View style={styles.tabItem}>
      <View>
        <Icon name={focused ? iconActive : icon} size={23} color={tint} />
        {badge > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.tabBar }]}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={[styles.tabLabel, { color: labelTint }]}>{label}</Text>
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

  // G9: count app opens (the review ask waits for the 4th) — once per launch.
  useEffect(() => { useNudges.getState().appOpened(); }, []);

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

  // G5: claims the server auto-approves have no parent tap to trigger the
  // bonus-chest check (chests are written from a parent's device — rules). So a
  // parent's phone catches up on launch: every kid, today and yesterday. The
  // chest ids are fixed per person+day, so re-checking never double-awards.
  const chestSweepDone = useRef(false);
  useEffect(() => {
    const isParentUser = member?.role === 'parent' || member?.role === 'admin_parent';
    if (chestSweepDone.current || !isParentUser || !family?.id || !members.length) return;
    chestSweepDone.current = true;
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    for (const kid of (members as any[]).filter(isKid)) {
      for (const day of [yesterday, today]) {
        checkSurprisePacks({
          familyId: family.id,
          member: { id: kid.id, isManaged: kid.isManaged },
          dateKey: dateKeyOf(day),
          weekStartDay: family.weekStartDay ?? 1,
        }).catch(() => {});
      }
    }
  }, [member?.role, family?.id, family?.weekStartDay, members]);

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

  // Everything waiting for a parent (task claims + reward requests) → badge on
  // the Family tab, so a kid's claim is visible from any screen. Parents only.
  const isParent = member?.role === 'parent' || member?.role === 'admin_parent';
  const [pendingClaims, setPendingClaims] = useState(0);
  const [pendingRewards, setPendingRewards] = useState(0);
  useEffect(() => {
    if (!family?.id || !isParent) { setPendingClaims(0); setPendingRewards(0); return; }
    const off1 = Col.completions(family.id).where('status', '==', 'pending')
      .onSnapshot((snap: any) => setPendingClaims(snap.size ?? snap.docs.length), () => {});
    const off2 = Col.redemptions(family.id).where('status', '==', 'pending')
      .onSnapshot((snap: any) => setPendingRewards(snap.size ?? snap.docs.length), () => {});
    return () => { off1(); off2(); };
  }, [family?.id, isParent]);
  const waiting = pendingClaims + pendingRewards;

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
          tabBarAccessibilityLabel: 'Today',
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="list-outline" iconActive="list" label="Today" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          tabBarAccessibilityLabel: 'Scores',
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="trophy-outline" iconActive="trophy" label="Scores" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          tabBarAccessibilityLabel: 'Rewards',
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
          tabBarAccessibilityLabel: waiting > 0 ? `Family, ${waiting} waiting for your OK` : 'Family',
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="people-outline" iconActive="people" label="Family" focused={focused} badge={waiting} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarAccessibilityLabel: 'Settings',
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
  badge: {
    position: 'absolute', top: -5, right: -11, minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontFamily: FontFamily.extraBold },
  tabLabel: {
    fontSize: 10,
    fontFamily: FontFamily.bold,
    color: Colors.textMuted,
    marginTop: 3,
    textAlign: 'center',
  },
});
