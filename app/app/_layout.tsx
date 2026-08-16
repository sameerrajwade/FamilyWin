import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="task/create" options={{ presentation: 'modal' }} />
      <Stack.Screen name="task/packs" options={{ presentation: 'modal' }} />
      <Stack.Screen name="reward/packs" options={{ presentation: 'modal' }} />
      <Stack.Screen name="discipline/log" options={{ presentation: 'modal' }} />
      <Stack.Screen name="member/[id]" />
      <Stack.Screen name="family" />
      <Stack.Screen name="settings/appearance" />
      <Stack.Screen name="settings/notifications" />
      <Stack.Screen name="settings/parental" />
      <Stack.Screen name="settings/about" />
      <Stack.Screen name="member/add-child" options={{ presentation: 'modal' }} />
      <Stack.Screen name="winner" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
    </Stack>
  );
}
