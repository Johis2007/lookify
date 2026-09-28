import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useColorScheme } from '@/components/useColorScheme';
import { startLocationTracking, stopLocationTracking, isTrackingActive } from '@/lib/location';

export default function OnlineScreen() {
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string>('Verificando...');
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const bg = isDark ? '#121212' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#000000';
  const cardBg = isDark ? '#1E1E1E' : '#F5F5F5';
  const primaryColor = '#E85D7A';
  const onlineColor = '#22C55E';

  const checkTrackingStatus = async () => {
    const active = await isTrackingActive();
    setIsOnline(active);
    setLocationStatus(active ? '🟢 Enviando ubicación cada 8s / 20m' : '🔴 Offline - Sin tracking GPS');
  };

  useEffect(() => {
    checkTrackingStatus();
  }, []);

  const toggleOnline = async () => {
    if (isOnline) {
      // Ir offline
      stopLocationTracking();
      setIsOnline(false);
      setLocationStatus('🔴 Offline - Sin tracking GPS');
      Alert.alert('Offline', 'Ya no apareces en el mapa para clientes');
    } else {
      // Ir online - solicitar permisos y empezar tracking
      setLoading(true);
      const { success, error } = await startLocationTracking('prof-id-placeholder');
      setLoading(false);
      if (success) {
        setIsOnline(true);
        setLocationStatus('🟢 Enviando ubicación cada 8s / 20m');
        Alert.alert('Online', '¡Ahora apareces en el mapa para clientes cercanos!');
      } else {
        Alert.alert('Error', error || 'No se pudo activar el tracking GPS');
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: textColor }]}>Modo Profesional</Text>
      </View>

      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <View style={styles.statusRow}>
          <View style={styles.statusIndicator}>
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: isOnline ? onlineColor : '#EF4444',
              }}
            />
            <Text style={[styles.statusText, { color: textColor }]}>
              {isOnline ? 'EN LÍNEA' : 'FUERA DE LÍNEA'}
            </Text>
          </View>
        </View>

        <Text style={[styles.statusDetail, { color: textColor, opacity: 0.7 }]}>
          {locationStatus}
        </Text>

        <TouchableOpacity
          style={[
            styles.toggleBtn,
            { backgroundColor: isOnline ? '#EF4444' : primaryColor },
            { opacity: loading ? 0.7 : 1 },
          ]}
          onPress={toggleOnline}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="large" />
          ) : (
            <Text style={styles.toggleBtnText}>
              {isOnline ? 'PONERME OFFLINE' : 'PONERME ONLINE'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.infoSection}>
        <Text style={[styles.sectionTitle, { color: textColor }]}>Cómo funciona</Text>
        <View style={[styles.infoCard, { backgroundColor: cardBg }]}>
          <Text style={[styles.infoItem, { color: textColor }]}>
            📍 <Text style={{ fontWeight: '500' }}>GPS inteligente:</Text>{' '}
            Solo envía ubicación si te moviste {'\u003E'}20m o pasó 8s
          </Text>
          <Text style={[styles.infoItem, { color: textColor }]}>
            🔋 <Text style={{ fontWeight: '500' }}>Batería optimizada:</Text> Heartbeat cada 30s para mantener estado
          </Text>
          <Text style={[styles.infoItem, { color: textColor }]}>
            👥 <Text style={{ fontWeight: '500' }}>Clientes te ven:</Text> En radio 3/5/10km con tu foto y rating
          </Text>
          <Text style={[styles.infoItem, { color: textColor }]}>
            🔔 <Text style={{ fontWeight: '500' }}>Solicitudes:</Text> Te llegan notificaciones de reservas al instante
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.navBtn, { backgroundColor: primaryColor }]}
        onPress={() => router.push('/(pro)/requests' as any)}
      >
        <Text style={styles.navBtnText}>Ver solicitudes pendientes →</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.navBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: primaryColor }]}
        onPress={() => router.push('/(pro)/profile' as any)}
      >
        <Text style={[styles.navBtnText, { color: primaryColor }]}>Mi perfil profesional</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold' },
  card: { borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#DDD' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  statusIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { fontSize: 18, fontWeight: '700' },
  statusDetail: { fontSize: 13, marginTop: 4 },
  toggleBtn: { padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 16 },
  toggleBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  infoSection: { marginTop: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  infoCard: { borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#DDD' },
  infoItem: { fontSize: 14, marginBottom: 10, lineHeight: 20 },
  navBtn: { padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 12 },
  navBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});