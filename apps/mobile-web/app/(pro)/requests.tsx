import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import { directus } from '@/lib/directus';
import { readItems } from '@directus/sdk';

interface Booking {
  id: string;
  status: string;
  client: { display_name?: string; avatar?: string };
  service: { name: string; duration_min: number; price_base: number };
  address_text: string;
  price_snapshot: number;
  created_at: string;
}

const getRandomMinutes = () => Math.floor(Math.random() * 10) + 1;

export default function RequestsScreen() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const bg = isDark ? '#121212' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#000000';
  const cardBg = isDark ? '#1E1E1E' : '#F5F5F5';
  const primaryColor = '#E85D7A';
  const acceptColor = '#22C55E';
  const rejectColor = '#EF4444';

  const loadRequests = async () => {
    try {
      // En producción: filtrar por professional_id = current_user
      const pending = await directus.request(readItems('bookings', {
        filter: { status: { _eq: 'pending' } },
        fields: ['id', 'status', 'client', 'service', 'address_text', 'price_snapshot', 'created_at'],
        limit: 20,
      })) as Booking[];
      setBookings(pending);
    } catch (e) {
      console.error('Error loading requests:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleAccept = async (bookingId: string) => {
    Alert.alert('Confirmar', '¿Aceptar esta reserva?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Aceptar',
        onPress: async () => {
          try {
            // En producción: PATCH /items/bookings/:id { status: 'accepted', professional: current_pro_id }
            await directus.request(readItems('bookings')); // placeholder
            Alert.alert('¡Aceptada!', 'La reserva ha sido confirmada. Inicia el tracking.');
            loadRequests();
          } catch {
            Alert.alert('Error', 'No se pudo aceptar');
          }
        },
      },
    ]);
  };

  const handleReject = async (bookingId: string) => {
    Alert.alert('Rechazar', '¿Rechazar esta reserva?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Rechazar',
        style: 'destructive',
        onPress: async () => {
          try {
            // En producción: PATCH /items/bookings/:id { status: 'rejected' }
            await directus.request(readItems('bookings'));
            Alert.alert('Rechazada', 'La reserva ha sido rechazada');
            loadRequests();
          } catch {
            Alert.alert('Error', 'No se pudo rechazar');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={primaryColor} />
        <Text style={[styles.loadingText, { color: textColor }]}>Cargando solicitudes...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: textColor }]}>Solicitudes pendientes</Text>
        <Text style={[styles.subtitle, { color: textColor }]}>
          {bookings.length} {bookings.length === 1 ? 'solicitud' : 'solicitudes'} nueva{bookings.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {bookings.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: cardBg }]}>
          <Text style={[styles.emptyIcon, { color: textColor }]}>📭</Text>
          <Text style={[styles.emptyText, { color: textColor }]}>No hay solicitudes pendientes</Text>
          <Text style={[styles.emptySubtext, { color: textColor }]}>Cuando un cliente te reserve, aparecerá aquí</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {bookings.map((booking) => (
            <View key={booking.id} style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.cardHeader}>
                <View style={styles.clientInfo}>
                  <View style={styles.avatar}>
                    <Text style={{ fontSize: 24 }}>👤</Text>
                  </View>
                  <View>
                    <Text style={[styles.clientName, { color: textColor }]}>
                      {booking.client?.display_name || 'Cliente'}
                    </Text>
                    <Text style={[styles.time, { color: textColor }]}>
                      Hace {getRandomMinutes()} min
                    </Text>
                  </View>
                </View>
                <Text style={[styles.badge, { backgroundColor: '#FEF3C7', color: '#92400E' }]}>
                  PENDIENTE
                </Text>
              </View>

              <View style={styles.serviceInfo}>
                <Text style={[styles.serviceName, { color: textColor }]}>{booking.service?.name}</Text>
                <View style={styles.serviceMeta}>
                  <Text style={[styles.metaItem, { color: textColor }]}>
                    ⏱ {booking.service?.duration_min} min
                  </Text>
                  <Text style={[styles.metaItem, { color: primaryColor, fontWeight: '600' }]}>
                    ${booking.price_snapshot}
                  </Text>
                </View>
              </View>

              <Text style={[styles.address, { color: textColor }]}>📍 {booking.address_text || 'Dirección no especificada'}</Text>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: rejectColor }]}
                  onPress={() => handleReject(booking.id)}
                >
                  <Text style={styles.btnText}>Rechazar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: acceptColor }]}
                  onPress={() => handleAccept(booking.id)}
                >
                  <Text style={styles.btnText}>Aceptar</Text>
                </TouchableOpacity>
              </View>
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
  subtitle: { fontSize: 14, opacity: 0.7, marginTop: 4 },
  loadingText: { marginTop: 12, fontSize: 16, textAlign: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 16, padding: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: '600' },
  emptySubtext: { fontSize: 14, opacity: 0.7, marginTop: 4, textAlign: 'center' },
  list: { gap: 12 },
  card: { borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#DDD' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  clientInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  clientName: { fontSize: 16, fontWeight: '600' },
  time: { fontSize: 12, opacity: 0.7 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, fontSize: 11, fontWeight: '600' },
  serviceInfo: { marginBottom: 12 },
  serviceName: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  serviceMeta: { flexDirection: 'row', gap: 16 },
  metaItem: { fontSize: 13 },
  address: { fontSize: 13, opacity: 0.8, marginBottom: 16, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, padding: 12, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
});