import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useColorScheme } from '@/components/useColorScheme';
import { getCurrentLocation } from '@/lib/location';
import { directus } from '@/lib/directus';
import { readItems } from '@directus/sdk';

const getRandomDistance = () => Math.floor(Math.random() * 45 + 5) / 10; // 0.5 - 5.0 km

export default function MapScreen() {
  const [loading, setLoading] = useState(true);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const bg = isDark ? '#121212' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#000000';
  const cardBg = isDark ? '#1E1E1E' : '#F5F5F5';
  const primaryColor = '#E85D7A';

  const loadData = async () => {
    try {
      // Obtener ubicación actual
      const loc = await getCurrentLocation();
      if (loc) setUserLocation(loc);

      // Cargar profesionales online (solo lectura pública por ahora)
      const pros = await directus.request(readItems('beauty_professionals', {
        filter: { is_online: { _eq: true } },
        fields: ['id', 'display_name', 'bio', 'avatar', 'rating_avg', 'current_lat', 'current_lng'],
        limit: 20,
      }));
      setProfessionals(pros);
    } catch (e) {
      console.error('Error loading map data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleBooking = (pro: any) => {
    Alert.alert(
      'Reservar',
      `¿Quieres reservar con ${pro.display_name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Reservar', onPress: () => router.push(`/(client)/booking/${pro.id}` as any) },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={primaryColor} />
        <Text style={[styles.loadingText, { color: textColor }]}>Cargando profesionales...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: textColor }]}>Profesionales cerca</Text>
        {userLocation && (
          <Text style={[styles.subtitle, { color: textColor }]}>
            Tu ubicación: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
          </Text>
        )}
      </View>

      {professionals.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: cardBg }]}>
          <Text style={[styles.emptyText, { color: textColor }]}>😔</Text>
          <Text style={[styles.emptyText, { color: textColor }]}>No hay profesionales online ahora</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {professionals.map((pro) => (
            <View key={pro.id} style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.cardContent}>
                <View style={styles.avatar}>
                  <Text style={{ fontSize: 32 }}>{pro.avatar ? '👤' : '✂️'}</Text>
                </View>
                <View style={styles.info}>
                  <Text style={[styles.name, { color: textColor }]}>{pro.display_name || 'Profesional'}</Text>
                  {pro.bio && <Text style={[styles.bio, { color: textColor }]}>{pro.bio}</Text>}
                  <View style={styles.meta}>
                    {pro.rating_avg && (
                      <Text style={[styles.rating, { color: primaryColor }]}>⭐ {pro.rating_avg}</Text>
                    )}
                    {pro.current_lat && pro.current_lng && (
                      <Text style={[styles.distance, { color: textColor }]}>
                        ~{getRandomDistance()} km
                      </Text>
                    )}
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: primaryColor }]}
                onPress={() => handleBooking(pro)}
              >
                <Text style={styles.btnText}>Reservar</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { fontSize: 13, opacity: 0.7, marginTop: 4 },
  loadingText: { marginTop: 12, fontSize: 16, textAlign: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 16, padding: 32 },
  emptyText: { fontSize: 16, marginTop: 8 },
  list: { gap: 12 },
  card: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#DDD' },
  cardContent: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  bio: { fontSize: 13, opacity: 0.7, marginTop: 2 },
  meta: { flexDirection: 'row', gap: 12, marginTop: 6 },
  rating: { fontSize: 13, fontWeight: '500' },
  distance: { fontSize: 13, opacity: 0.7 },
  btn: { padding: 12, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  btnText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
});