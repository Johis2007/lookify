import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

// Permisos centralizados de Lookify (ES): ubicación, cámara y galería/tarjeta.
// - Ubicación: radar de clientes + modo online del profesional (GPS).
// - Cámara: foto directa para avatar/portafolio del profesional.
// - Galería (incluye tarjeta SD en Android): elegir fotos existentes.
// Si el usuario niega dos veces (canAskAgain=false), se le lleva a Ajustes.

function openSettingsAlert(title: string, message: string) {
  Alert.alert(title, message, [
    { text: 'Ahora no', style: 'cancel' },
    { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
  ]);
}

// Ubicación en primer plano. alertOnDeny=false para pedirla sin bloquear
// (ej. onboarding: si niega, la app sigue y el radar la pedirá de nuevo).
export async function ensureLocationPermission(alertOnDeny = true): Promise<boolean> {
  const cur = await Location.getForegroundPermissionsAsync();
  if (cur.granted) return true;
  const req = await Location.requestForegroundPermissionsAsync();
  if (req.granted) return true;
  if (alertOnDeny) {
    openSettingsAlert(
      'Permiso de ubicación',
      'Lookify necesita tu ubicación para mostrarte profesionales cercanos en el radar. Actívala en ajustes.'
    );
  }
  return false;
}

export async function ensureCameraPermission(): Promise<boolean> {
  const cur = await ImagePicker.getCameraPermissionsAsync();
  if (cur.granted) return true;
  const req = await ImagePicker.requestCameraPermissionsAsync();
  if (req.granted) return true;
  openSettingsAlert(
    'Permiso de cámara',
    'Lookify necesita acceso a tu cámara para tomar fotos de tu perfil y portafolio profesional.'
  );
  return false;
}

export async function ensureMediaLibraryPermission(): Promise<boolean> {
  const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (cur.granted) return true;
  const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (req.granted) return true;
  openSettingsAlert(
    'Permiso de galería',
    'Lookify necesita acceso a tus fotos (galería y tarjeta) para tu avatar y portafolio profesional.'
  );
  return false;
}

// Foto con la cámara. Devuelve uri local o null (denegado/cancelado).
export async function takeProfessionalPhoto(): Promise<string | null> {
  if (!(await ensureCameraPermission())) return null;
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  return res.assets[0].uri;
}

// Foto desde galería/tarjeta. Devuelve uri local o null.
export async function pickProfessionalImage(): Promise<string | null> {
  if (!(await ensureMediaLibraryPermission())) return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  return res.assets[0].uri;
}

// Selector cámara o galería para el profesional (avatar/portafolio).
export function chooseProfessionalPhoto(onPick: (uri: string) => void): void {
  Alert.alert('Foto de perfil', 'Elige de dónde tomar la foto', [
    { text: 'Cancelar', style: 'cancel' },
    {
      text: '📷 Cámara',
      onPress: () => {
        void (async () => {
          const uri = await takeProfessionalPhoto();
          if (uri) onPick(uri);
        })();
      },
    },
    {
      text: '🖼️ Galería',
      onPress: () => {
        void (async () => {
          const uri = await pickProfessionalImage();
          if (uri) onPick(uri);
        })();
      },
    },
  ]);
}
