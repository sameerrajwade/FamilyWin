import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Colors, FontFamily, FontSize } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { Icon, IconName } from '@/components/ui/Icon';

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
            <TabIcon icon="list-outline" iconActive="list" label="Tasks" focused={focused} />
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
        name="history"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="stats-chart-outline" iconActive="stats-chart" label="Insights" focused={focused} />
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
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="settings-outline" iconActive="settings" label="Settings" focused={focused} />
          ),
        }}
      />
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
