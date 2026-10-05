import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import LookifyMap from '@/components/LookifyMap';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { ConfirmDialog, useConfirm } from '@/components/ConfirmDialog';
import { logBookingEvent, patchBooking } from '@/lib/api';
import { readJson } from '@/lib/http';
import { attachBookingToPro, emitBookingStatus, getSocket, isSocketLive, joinBooking, leaveBooking } from '@/lib/socket';

/* eslint-disable react-hooks/set-state-in-effect */

type ConnState = 'live' | 'polling' | 'connecting';

// Lookify Cliente - Seguimiento en Vivo (diseño Stitch, móvil + web).
export default function Tracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { authFetch } = useAuth();
  const confirm = useConfirm();
  const [booking, setBooking] = useState<any>(null);
  const [proPos, setProPos] = useState({ latitude: 19.435, longitude: -99.13 });
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [conn, setConn] = useState<ConnState>('connecting');
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const bookingRef = useRef<any>(null);
  useEffect(() => {
    bookingRef.current = booking;
  }, [booking]);
  const agoLabel = lastUpdate ? ` · act. hace ${Math.max(0, Math.round((nowTick - lastUpdate) / 1000))}s` : '';

  const proIdOf = (b: any): string | null => {
    if (!b) return null;
    const p = b.professional;
    if (typeof p === 'object' && p?.id) return String(p.id);
    if (typeof p === 'number' || typeof p === 'string') return String(p);
    return null;
  };

  const refreshFromDirectus = async () => {
    try {
      const r = await authFetch(`/items/bookings/${id}?fields=*,service.*,professional.*`);
      if (r.ok) {
        const data = (await readJson<{ data?: any }>(r))?.data;
        if (!data) return;
        setBooking((prev: any) => {
          if (prev && prev.status === data.status) return prev;
          return data;
        });
        const pid = proIdOf(data);
        if (pid) {
          const pr = data.professional;
          const lat = typeof pr === 'object' ? pr?.current_lat : undefined;
          const lng = typeof pr === 'object' ? pr?.current_lng : undefined;
          if (typeof lat === 'number' && typeof lng === 'number') {
            setProPos((prev) => {
              if (lastUpdate && Date.now() - lastUpdate < 20_000) return prev;
              return { latitude: lat, longitude: lng };
            });
          }
        }
      }
      const ev = await authFetch(`/items/booking_events?filter[booking][_eq]=${id}&sort=-created_at&limit=10`);
      if (ev.ok) {
        const data = (await readJson<{ data?: any[] }>(ev))?.data;
        if (Array.isArray(data)) setEvents(data);
      }
    } catch {
      /* sin red: se reintenta en el siguiente ciclo */
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      await refreshFromDirectus();
      if (mounted) setLoading(false);
    })();

    let s: ReturnType<typeof getSocket> | null = null;
    try {
      s = getSocket();
      const bid = String(id);
      joinBooking(bid);
      setConn(s.connected ? 'live' : 'connecting');

      const onConnect = () => {
        setConn('live');
        joinBooking(bid, proIdOf(bookingRef.current) || undefined);
      };
      const onDisconnect = () => setConn('polling');
      const onStatus = (p: any) => {
        if (String(p?.booking_id) !== bid) return;
        setBooking((b: any) => (b ? { ...b, status: p.status } : b));
        setLastUpdate(Date.now());
      };
      const onProLoc = (p: any) => {
        if (p?.booking_id && String(p.booking_id) !== bid) return;
        const pid = proIdOf(bookingRef.current);
        if (pid && p?.professional_id && String(p.professional_id) !== pid) return;
        if (typeof p?.lat === 'number' && typeof p?.lng === 'number') {
          setProPos({ latitude: p.lat, longitude: p.lng });
          setLastUpdate(Date.now());
          setConn('live');
        }
      };
      const onZone = (arr: any) => {
        const pid = proIdOf(bookingRef.current);
        if (!pid || !Array.isArray(arr)) return;
        const mine = arr.find((x: any) => String(x?.professional_id) === pid);
        if (mine && typeof mine.lat === 'number') {
          setProPos({ latitude: mine.lat, longitude: mine.lng });
          setLastUpdate(Date.now());
          setConn('live');
        }
      };
      s.on('connect', onConnect);
      s.on('disconnect', onDisconnect);
      s.on('booking:status', onStatus);
      s.on('pro:location', onProLoc);
      s.on('zone:update', onZone);
      const t = setTimeout(() => {
        if (!isSocketLive()) setConn('polling');
      }, 3000);
      return () => {
        clearTimeout(t);
        s?.off('connect', onConnect);
        s?.off('disconnect', onDisconnect);
        s?.off('booking:status', onStatus);
        s?.off('pro:location', onProLoc);
        s?.off('zone:update', onZone);
        leaveBooking(String(id));
      };
    } catch {
      setConn('polling');
    }
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const clock = setInterval(() => setNowTick(Date.now()), 5000);
    const t = setInterval(() => {
      refreshFromDirectus().catch(() => {});
      if (!isSocketLive()) setConn('polling');
    }, 15_000);
    return () => {
      clearInterval(clock);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const advance = async (status: string) => {
    if (status === 'cancelled') {
      const ok = await confirm.show(
        '¿Cancelar servicio?',
        'El profesional será notificado. Pueden aplicar cargos si ya inició.',
        { destructive: true }
      );
      if (!ok) return;
    }
    await patchBooking(authFetch, Number(id), { status: status as any });
    await logBookingEvent(authFetch, Number(id), status, { note: 'Actualizado desde app' });
    setBooking({ ...booking, status });
    try {
      emitBookingStatus(id as string, status);
      if (status === 'accepted') {
        const pid = proIdOf(bookingRef.current);
        if (pid) attachBookingToPro(id as string, pid);
      }
    } catch {}
    if (status === 'completed') router.push(`/rating/${id}`);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>Cargando seguimiento…</Text>
      </View>
    );
  }
  if (!booking) {
    return (
      <View style={styles.center}>
        <Text>No se encontró la reserva #{id}</Text>
      </View>
    );
  }

  const steps = ['pending', 'accepted', 'in_progress', 'completed'];
  const idx = Math.max(0, steps.indexOf(booking.status));
  const stepName: Record<string, string> = { pending: 'Asignado', accepted: 'En camino', in_progress: 'En servicio', completed: 'Finalizado' };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        {/* Pill EN VIVO */}
        <View style={styles.liveWrap}>
          <View style={styles.livePill}>
            <View style={[styles.dot, conn === 'live' ? styles.dotLive : conn === 'polling' ? styles.dotPoll : styles.dotWait]} />
            <Text style={styles.liveT}>
              {conn === 'live' ? 'EN VIVO' : conn === 'polling' ? 'POLLING 15s' : 'CONECTANDO'}
            </Text>
          </View>
          <Text style={styles.liveSub} numberOfLines={1}>
            {booking.professional?.display_name || 'Tu profesional'} en camino{agoLabel}
          </Text>
        </View>

        {/* Mapa */}
        <View style={styles.mapWrap}>
          <LookifyMap
            initial={proPos}
            pins={[{ id: 'pro', latitude: proPos.latitude, longitude: proPos.longitude, title: 'Tu profesional en camino' }]}
          />
          <View style={styles.eta}>
            <Text style={styles.etaT}>🛵 {booking.eta_min || 12} min · {conn === 'live' ? 'en vivo' : 'polling'}</Text>
          </View>
        </View>

        {/* Pro card */}
        <View style={styles.card}>
          <View style={styles.proRow}>
            <View style={styles.proAvatar}>
              <Text style={styles.proAvatarT}>{(booking.professional?.display_name?.[0] || 'P').toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.proName}>{booking.professional?.display_name || 'Profesional Lookify'}</Text>
              <Text style={styles.proMeta}>★ {booking.professional?.rating_avg || 4.9} · Kit sanitizado</Text>
              <Text style={styles.proMeta}>
                {typeof booking.service === 'object' ? booking.service?.name : ''} · $
                {Number(booking.price_snapshot || 0).toLocaleString('es-CO')}
              </Text>
            </View>
            <View style={styles.goldTag}>
              <Text style={styles.goldT}>Gold</Text>
            </View>
          </View>
        </View>

        {/* Stepper */}
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle}>Estado del servicio</Text>
            <Text style={styles.liveTag}>En tiempo real</Text>
          </View>
          {steps.map((s, i) => (
            <View key={s} style={styles.stepRow}>
              <View style={[styles.stepDot, i <= idx && styles.stepDone]}>
                {i <= idx && <Text style={styles.stepCheck}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stepT, i <= idx && styles.stepTOn]}>{stepName[s]}</Text>
                {i === idx && <Text style={styles.stepSub}>Paso {idx + 1} de {steps.length}</Text>}
              </View>
            </View>
          ))}
          <View style={styles.btnRow}>
            {booking.status === 'accepted' && (
              <Pressable style={styles.primary} onPress={() => advance('in_progress')}>
                <Text style={styles.primaryT}>Iniciar servicio</Text>
              </Pressable>
            )}
            {booking.status === 'in_progress' && (
              <Pressable style={styles.primary} onPress={() => advance('completed')}>
                <Text style={styles.primaryT}>Marcar completada</Text>
              </Pressable>
            )}
            {booking.status === 'pending' && (
              <Pressable style={styles.ghost} onPress={() => advance('cancelled')}>
                <Text style={styles.ghostT}>Cancelar reserva</Text>
              </Pressable>
            )}
            {booking.status === 'completed' && (
              <Pressable style={styles.amber} onPress={() => router.push(`/rating/${id}`)}>
                <Text style={styles.amberT}>Calificar ★</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Tarifa */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Resumen de tarifa</Text>
          <View style={styles.fareRow}>
            <Text style={styles.fareL}>{typeof booking.service === 'object' ? booking.service?.name : 'Servicio'}</Text>
            <Text style={styles.fareV}>${Number(booking.price_snapshot || 0).toLocaleString('es-CO')}</Text>
          </View>
          <View style={styles.fareRow}>
            <Text style={styles.fareL}>Domicilio</Text>
            <Text style={styles.fareV}>$5.000</Text>
          </View>
          <View style={styles.fareTotal}>
            <Text style={styles.fareTotalT}>Total · sin cargos ocultos</Text>
          </View>
        </View>

        {!!events.length && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Actividad reciente</Text>
            {events.map((e) => (
              <Text key={e.id} style={styles.ev}>
                • {e.status} · {e.created_at ? new Date(e.created_at).toLocaleTimeString() : ''} {e.note || ''}
              </Text>
            ))}
          </View>
        )}

        {booking.status !== 'completed' && booking.status !== 'cancelled' && (
          <Pressable style={styles.cancelBtn} onPress={() => advance('cancelled')}>
            <Text style={styles.cancelT}>Cancelar servicio</Text>
          </Pressable>
        )}
      </ScrollView>
      <ConfirmDialog {...confirm.dialogProps} confirmLabel="Sí, cancelar" destructive />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Stitch.colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  liveWrap: { padding: 16, paddingBottom: 8 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Stitch.colors.primaryContainer, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'flex-start' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotLive: { backgroundColor: '#4edea3' },
  dotPoll: { backgroundColor: Stitch.colors.secondaryContainer },
  dotWait: { backgroundColor: '#9CA3AF' },
  liveT: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  liveSub: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, marginTop: 6, fontWeight: '600' },
  mapWrap: { height: 260, marginHorizontal: 16, borderRadius: 16, overflow: 'hidden' },
  eta: { position: 'absolute', bottom: 10, left: 10, backgroundColor: '#fff', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  etaT: { color: Stitch.colors.onSurface, fontSize: 12, fontWeight: '800' },
  card: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginTop: 12, padding: 16, gap: 8, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  proRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  proAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: Stitch.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  proAvatarT: { color: Stitch.colors.secondaryContainer, fontWeight: '900', fontSize: 22 },
  proName: { fontSize: 15, fontWeight: '800', color: Stitch.colors.onSurface },
  proMeta: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, marginTop: 2 },
  goldTag: { backgroundColor: Stitch.colors.surfaceContainer, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  goldT: { fontSize: 10, fontWeight: '800', color: Stitch.colors.primaryContainer },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Stitch.colors.onSurface },
  liveTag: { fontSize: 10, fontWeight: '800', color: Stitch.colors.secondary, backgroundColor: Stitch.colors.secondaryContainer + '33', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: Stitch.colors.surfaceContainer, alignItems: 'center', justifyContent: 'center' },
  stepDone: { backgroundColor: Stitch.colors.onTertiaryContainer },
  stepCheck: { color: '#fff', fontWeight: '900', fontSize: 14 },
  stepT: { fontSize: 13, fontWeight: '600', color: Stitch.colors.onSurfaceVariant },
  stepTOn: { color: Stitch.colors.onSurface, fontWeight: '800' },
  stepSub: { fontSize: 11, color: Stitch.colors.onSurfaceVariant },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  primary: { flex: 1, backgroundColor: Stitch.colors.primaryContainer, borderRadius: 12, padding: 13, alignItems: 'center' },
  primaryT: { color: '#fff', fontWeight: '800' },
  ghost: { flex: 1, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, borderRadius: 12, padding: 13, alignItems: 'center' },
  ghostT: { fontWeight: '700', color: Stitch.colors.onSurface },
  amber: { flex: 1, backgroundColor: Stitch.colors.secondaryContainer, borderRadius: 12, padding: 13, alignItems: 'center' },
  amberT: { color: Stitch.colors.primaryContainer, fontWeight: '900' },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  fareL: { fontSize: 13, color: Stitch.colors.onSurfaceVariant },
  fareV: { fontSize: 13, fontWeight: '800', color: Stitch.colors.onSurface },
  fareTotal: { backgroundColor: Stitch.colors.surfaceLow, borderRadius: 10, padding: 10, marginTop: 4 },
  fareTotalT: { fontSize: 12, fontWeight: '800', color: Stitch.colors.onTertiaryContainer },
  ev: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, marginTop: 3 },
  cancelBtn: { marginHorizontal: 16, marginTop: 12, backgroundColor: Stitch.colors.errorContainer, borderRadius: 12, padding: 14, alignItems: 'center' },
  cancelT: { color: Stitch.colors.onErrorContainer, fontWeight: '800' },
});
