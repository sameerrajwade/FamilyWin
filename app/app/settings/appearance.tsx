/**
 * app/app/settings/appearance.tsx
 * Sub-screen: theme selection (Light / Dark / Auto) and Child mode. Wraps the
 * existing AppearanceSettings control, which already renders its own titled card
 * — so we give it padding rather than a second surrounding card (no box-in-box).
 */
import { View } from 'react-native';
import { SettingsScaffold } from '@/components/ui/SettingsUI';
import { AppearanceSettings } from '@/components/ui/AppearanceSettings';
import { Spacing } from '@/constants/theme';

export default function AppearanceScreen() {
  return (
    <SettingsScaffold title="Appearance">
      <View style={{ paddingHorizontal: Spacing.lg }}>
        <AppearanceSettings />
      </View>
    </SettingsScaffold>
  );
}
