import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';

/**
 * Pick a photo and return a readable local URI (or null if cancelled).
 *
 * Uses expo-image-picker's launchImageLibraryAsync / launchCameraAsync, which
 * copy the chosen image into Expo's cache and return a plain `file://` URI that
 * Firebase Storage putFile() reads directly — sidestepping the Android 13
 * content:// "No content provider" upload failure that the SAF/OPEN_DOCUMENT
 * approach hit. We deliberately DON'T pass `allowsEditing` — its translucent
 * crop overlay was the real cause of the earlier "blank picker" symptom.
 */
export async function pickPhotoUri(source: 'camera' | 'library'): Promise<string | null> {
  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    if (permission.canAskAgain === false) {
      Alert.alert('Permission needed', 'Enable photo access in Settings to choose a photo.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
    } else {
      Alert.alert('Permission needed', 'Permission is required to select a photo.');
    }
    return null;
  }

  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });

  if (result.canceled) return null;
  return result.assets?.[0]?.uri ?? null;
}
