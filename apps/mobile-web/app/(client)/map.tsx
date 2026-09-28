import { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform, Dimensions, Animated } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Callout } from 'react-native-maps';
import { router } from 'expo-router';
import { useColorScheme } from '@/components/useColorScheme';
import { getCurrentLocation } from '@/lib/location';
import { directus } from '@/lib/directus';
import { readItems } from '@directus/sdk';
import { connectSocket, onZoneUpdate, onNearbyResponse, joinZone, leaveZone } from '@/lib/socket';

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.0922;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

const DEFAULT_LAT = 19.4326; // CDMX
const DEFAULT_LNG = -99.1332;

const getRandomDistance = () => Math.floor(Math.random() * 45 + 5) / 10;

interface Professional {
  id: string;
  display_name: string;
  bio?: string;
  avatar?: string;
  rating_avg?: number;
  lat: number;
  lng: number;
  distance_m?: number;
}

function MapScreen() {
  const [loading, setLoading] = useState(true);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [region, setRegion] = useState({
    latitude: DEFAULT_LAT,
    longitude: DEFAULT_LNG,
    latitudeDelta: LATITUDE_DELTA,
    longitudeDelta: LONGITUDE_DELTA,
  });
  const [selectedProfessional, setSelectedProfessional] = useState<Professional | null>(null);
  const [bottomSheetHeight, setBottomSheetHeight] = useState(new Animated.Value(0));
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
      if (loc) {
        setUserLocation(loc);
        setRegion(prev => ({ ...prev, latitude: loc.lat, longitude: loc.lng }));
      }

      // Cargar profesionales online
      const pros = await directus.request(readItems('beauty_professionals', {
        filter: { is_online: { _eq: true } },
        fields: ['id', 'display_name', 'bio', 'avatar', 'rating_avg', 'current_lat', 'current_lng'],
        limit: 20,
      }));
      const mapped = pros.map((p: any) => ({
        id: p.id,
        display_name: p.display_name,
        bio: p.bio,
        avatar: p.avatar,
        rating_avg: p.rating_avg,
        lat: p.current_lat || DEFAULT_LAT + (Math.random() - 0.5) * 0.01,
        lng: p.current_lng || DEFAULT_LNG + (Math.random() - 0.5) * 0.01,
        distance_m: p.current_lat && p.current_lng && loc 
          ? Math.round(haversine(loc.lat, loc.lng, p.current_lat, p.current_lng))
          : undefined,
      }));
      setProfessionals(mapped);
    } catch (e) {
      console.error('Error loading map data:', e);
    } finally {
      setLoading(false);
    }
  };

  // Haversine distance
  const haversine = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  useEffect(() => {
    loadData();
    connectSocket();
    
    // Unirse a zona para recibir updates en tiempo real
    if (userLocation) {
      joinZone(userLocation.lat, userLocation.lng);
    }
    
    // Escuchar actualizaciones de zona en tiempo real
    const unsubZone = onZoneUpdate((pros) => {
      setProfessionals(prev => {
        const updated = new Map(prev.map(p => [p.id, p]));
        pros.forEach((p: any) => {
          if (updated.has(p.professional_id)) {
            updated.set(p.professional_id, { ...updated.get(p.professional_id)!, lat: p.lat, lng: p.lng });
          }
        });
        return Array.from(updated.values());
      });
    });

    // Respuesta a query nearby
    const unsubNearby = onNearbyResponse((pros: Professional[]) => {
      setProfessionals(pros);
    });

    return () => {
      if (userLocation) {
        leaveZone(userLocation.lat, userLocation.lng);
      }
      unsubZone();
      unsubNearby();
    };
  }, [userLocation]);

  const handleRegionChange = (newRegion: any) => setRegion(newRegion);

  const handleMarkerPress = (professional: Professional) => {
    setSelectedProfessional(professional);
    Animated.timing(bottomSheetHeight, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeBottomSheet = () => {
    Animated.timing(bottomSheetHeight, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setSelectedProfessional(null));
  };

  const handleBooking = (pro: Professional) => {
    closeBottomSheet();
    Alert.alert(
      'Reservar',
      `¿Quieres reservar con ${pro.display_name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Reservar', onPress: () => router.push(`/(client)/booking/${pro.id}` as any) },
      ]
    );
  };

  const renderMarker = (professional: Professional) => (
    <Marker
      key={professional.id}
      coordinate={{ latitude: professional.lat, longitude: professional.lng }}
      title={professional.display_name}
      onPress={() => handleMarkerPress(professional)}
    >
      <View style={styles.markerWrapper}>
        <View style={styles.marker}>
          <Text style={{ fontSize: 20 }}>✂️</Text>
        </View>
      </View>
    </Marker>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={primaryColor} />
        <Text style={[styles.loadingText, { color: textColor }]}>Cargando mapa...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={region}
        onRegionChangeComplete={handleRegionChange}
        showsUserLocation={true}
        showsMyLocationButton={true}
        loadingEnabled={true}
        mapType="standard"
      >
        {professionals.map(renderMarker)}
      </MapView>

      {/* Header overlay */}
      <View style={styles.headerOverlay}>
        <View style={styles.headerCard}>
          <Text style={[styles.title, { color: textColor }]}>Profesionales cerca</Text>
          {userLocation && (
            <Text style={[styles.subtitle, { color: textColor }]}>
              Tu ubicación: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
            </Text>
          )}
        </View>
      </View>

      {/* Bottom Sheet */}
      <Animated.View
        style={[
          styles.bottomSheet,
          { backgroundColor: cardBg },
          {
            transform: [{
              translateY: bottomSheetHeight.interpolate({
                inputRange: [0, 1],
                outputRange: [height * 0.6, 0],
              }),
            }],
          },
        ]}
      >
        <TouchableOpacity onPress={closeBottomSheet} style={styles.backdrop} activeOpacity={1} />
        <View style={styles.sheetContent}>
          <View style={styles.sheetHandle} />
          
          {selectedProfessional && (
            <View>
              <View style={styles.proCard}>
                <View style={styles.proHeader}>
                  <View style={styles.proAvatar}>
                    <Text style={{ fontSize: 32 }}>✂️</Text>
                  </View>
                  <View style={styles.proInfo}>
                    <Text style={[styles.proName, { color: textColor }]}>{selectedProfessional.display_name}</Text>
                    {selectedProfessional.rating_avg && (
                      <Text style={[styles.proRating, { color: primaryColor }]}>⭐ {selectedProfessional.rating_avg}</Text>
                    )}
                  </View>
                </View>
                {selectedProfessional.bio && (
                  <Text style={[styles.proBio, { color: textColor }]}>{selectedProfessional.bio}</Text>
                )}
                <View style={styles.proMeta}>
                  {selectedProfessional.distance_m && (
                    <Text style={[styles.proDistance, { color: primaryColor, fontWeight: '600' }]}>
                      📍 {Math.round(selectedProfessional.distance_m / 100) / 10} km
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={[styles.proBtn, { backgroundColor: primaryColor }]}
                  onPress={() => handleBooking(selectedProfessional!)}
                >
                  <Text style={styles.proBtnText}>Reservar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Animated.View>

      {professionals.length === 0 && (
        <View style={[styles.emptyOverlay, { backgroundColor: cardBg }]}>
          <Text style={[styles.emptyText, { color: textColor }]}>😔</Text>
          <Text style={[styles.emptyText, { color: textColor }]}>No hay profesionales online ahora</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  headerOverlay: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: { fontSize: 20, fontWeight: 'bold' },
  subtitle: { fontSize: 12, opacity: 0.7, marginTop: 4 },
  loadingText: { marginTop: 12, fontSize: 16, textAlign: 'center' },
  emptyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: { fontSize: 16, marginTop: 8, textAlign: 'center' },
  markerWrapper: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  marker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: '#E85D7A',
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    opacity: 0.3,
  },
  sheetContent: { paddingBottom: 30 },
  sheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CCC',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  proCard: { padding: 20 },
  proHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  proAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  proInfo: { flex: 1 },
  proName: { fontSize: 18, fontWeight: '600' },
  proRating: { fontSize: 14, marginTop: 2 },
  proBio: { fontSize: 14, opacity: 0.8, marginBottom: 12, lineHeight: 20 },
  proMeta: { marginBottom: 16 },
  proDistance: { fontSize: 15 },
  proBtn: { padding: 16, borderRadius: 14, alignItems: 'center' },
  proBtnText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
});

export default MapScreen;