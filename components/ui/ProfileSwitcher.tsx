/**
 * components/ui/ProfileSwitcher.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shown at the top of the Home screen when a parent is "acting as" a managed
 * child.  Tapping it opens a bottom-sheet picker to switch profiles.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ScrollView, Pressable,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useAuthStore, useFamilyStore } from '@/store';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { Avatar } from '@/components/ui';
import type { MemberDoc } from '@/lib/firebase';

// ── Banner shown when acting as a managed child ───────────────────────────────

interface ProfileSwitcherBannerProps {
  onPress: () => void;
}

export function ProfileSwitcherBanner({ onPress }: ProfileSwitcherBannerProps) {
  const { member, actingAsMember } = useAuthStore();
  const { members } = useFamilyStore();
  const isParent = member?.role === 'admin_parent' || member?.role === 'parent';
  const managedChildren = members.filter((m) => m.isManaged);

  // Only show banner for parents (or when already switched to a child)
  if (!isParent && !actingAsMember) return null;
  // If parent has no managed children yet and not switched, hide banner
  if (isParent && managedChildren.length === 0 && !actingAsMember) return null;

  const activeProfile = actingAsMember ?? member;
  const isActingAsSelf = !actingAsMember;

  return (
    <TouchableOpacity
      style={[styles.banner, isActingAsSelf && styles.bannerSelf]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.bannerLeft}>
        <Avatar emoji={activeProfile?.avatarEmoji ?? '👤'} photoURL={activeProfile?.photoURL} size={32} />
        <View>
          <Text style={styles.bannerLabel}>{isActingAsSelf ? 'Doing tasks for' : 'Acting as'}</Text>
          <Text style={styles.bannerName}>{isActingAsSelf ? 'Yourself' : activeProfile?.displayName}</Text>
        </View>
      </View>
      <View style={styles.bannerRight}>
        <Text style={styles.switchText}>Switch Profile 🔄</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Profile picker shown as bottom-sheet modal ────────────────────────────────

interface ProfilePickerProps {
  visible: boolean;
  onClose: () => void;
}

export function ProfilePickerModal({ visible, onClose }: ProfilePickerProps) {
  const { member, actingAsMember, setActingAsMember } = useAuthStore();
  const { members } = useFamilyStore();

  // All profiles available to switch to: self + every managed child
  const managedChildren = members.filter((m) => m.isManaged);
  const isParent = member?.role === 'admin_parent' || member?.role === 'parent';

  function selectProfile(target: MemberDoc | null) {
    // null = revert to self
    setActingAsMember(target?.id === member?.id ? null : target);
    onClose();
  }

  if (!isParent) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {/* Handle */}
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Whose tasks are you doing?</Text>
          <Text style={styles.sheetSubtitle}>
            Switch profiles to complete tasks on behalf of a family member
          </Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Self */}
            <ProfileRow
              member={member!}
              label="Myself"
              isActive={!actingAsMember}
              onPress={() => selectProfile(null)}
            />

            {/* Managed children */}
            {managedChildren.map((child) => (
              <ProfileRow
                key={child.id}
                member={child}
                label={child.displayName}
                isActive={actingAsMember?.id === child.id}
                onPress={() => selectProfile(child)}
              />
            ))}

            {managedChildren.length === 0 && (
              <View style={styles.emptyHint}>
                <Text style={styles.emptyHintText}>
                  No managed children yet.{'\n'}
                  Go to Settings → Manage Children to add them.
                </Text>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Single row inside the picker ──────────────────────────────────────────────

function ProfileRow({
  member,
  label,
  isActive,
  onPress,
}: {
  member: MemberDoc;
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        style={[styles.profileRow, isActive && styles.profileRowActive]}
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.97, { damping: 15 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 12 }); }}
        activeOpacity={1}
      >
        <Avatar emoji={member.avatarEmoji} photoURL={member.photoURL} size={44} />
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, isActive && styles.rowNameActive]}>{label}</Text>
          <Text style={styles.rowRole}>
            {member.isManaged ? '👶 Managed profile' : `${member.role.replace('_', ' ')}`}
          </Text>
        </View>
        {isActive && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primary,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    ...Shadow.sm,
  },
  bannerSelf: {
    backgroundColor: Colors.primary + 'CC', // slightly transparent when acting as self
  },
  bannerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bannerAvatar: { fontSize: 26 },
  bannerLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: 'rgba(255,255,255,0.75)' },
  bannerName: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: '#FFFFFF' },
  bannerRight: {},
  switchText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: 'rgba(255,255,255,0.9)' },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 40,
    maxHeight: '75%',
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 16 },
  sheetTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.extraBold, color: Colors.text, paddingHorizontal: Spacing.lg, marginBottom: 4 },
  sheetSubtitle: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: Colors.textSecondary, paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },

  // Rows
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.sm,
    borderRadius: BorderRadius.lg,
    marginBottom: 4,
  },
  profileRowActive: { backgroundColor: Colors.primary + '15', borderWidth: 1.5, borderColor: Colors.primary + '55' },
  rowAvatar: { fontSize: 36 },
  rowInfo: { flex: 1 },
  rowName: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: Colors.text },
  rowNameActive: { color: Colors.primary },
  rowRole: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, color: Colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  checkmark: { fontSize: FontSize.lg, color: Colors.primary, fontFamily: FontFamily.black },

  // Empty hint
  emptyHint: { padding: Spacing.xl, alignItems: 'center' },
  emptyHintText: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
