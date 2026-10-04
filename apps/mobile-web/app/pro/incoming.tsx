import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { useProLiveState } from '@/lib/proLiveState';
import { kmBetween, logBookingEvent, patchBooking } from '@/lib/api';
import { attachBookingToPro, emitBookingStatus, getSocket } from '@/lib/socket';

/* eslint-disable react-hooks/set-state-in-effect */

const TIMEOUT_S = 60;

type QueueItem = {
  id: number;
  serviceName: string;
  clientName: string;
  address: string;
  lat?: number;
  lng?: number;
  total: number;
  net: number;
  createdAt?: string;
};

// Lookify PRO - Solicitud entrante (diseño Stitch, móvil + web).
// Cola de reservas pending asignadas al profesional: aceptar (vincula GPS y
// avisa al cliente en vivo) o rechazar (pasa el turno). Datos reales Directus.
export default function Incoming() {
  const { isProfessional, authFetch } = useAuth();
  const proLive = useProLiveState();
  const pid = proLive.professionalId;
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [secs, setSecs] = useState(TIMEOUT_S);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!pid) {
      setLoading(false);
      return;
    }
    try {
      const r = await authFetch(
        `/items/bookings?filter[professional][_eq]=${pid}&filter[status][_eq]=pending&sort=-created_at&limit=5&fields=*,service.*,client.*`
      );
      if (!r.ok) return;
      const { data } = await r.json();
      const rows = Array.isArray(data) ? data : [];
      setQueue(
        rows.map((b: any) => {
          const total = Number(b.price_snapshot ?? b.service?.price_base ?? 0);
          return {
            id: Number(b.id),
            serviceName: b.service?.name ?? `Servicio #${b.service}`,
            clientName: b.client?.first_name ?? 'Cliente Lookify',
            address: b.address_text ?? 'Sin dirección',
            lat: typeof b.lat === 'number' ? b.lat : undefined,
            lng: typeof b.lng === 'number' ? b.lng : undefined,
            total,
            net: Math.round(total * 0.85),
            createdAt: b.created_at,
          };
        })
      );
      setIdx(0);
      setSecs(TIMEOUT_S);
    } finally {
      setLoading(false);
    }
  }, [authFetch, pid]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  // Nueva solicitud en vivo mientras se mira la cola.
  useEffect(() => {
    try {
      const s = getSocket();
      const onNew = () => load().catch(() => {});
      s.on('booking:new', onNew);
      return () => {
        s.off('booking:new', onNew);
      };
    } catch {
      return undefined;
    }
  }, [load]);

  // Countdown por solicitud: al agotarse pasa a la siguiente sin tocar estado.
  useEffect(() => {
    if (queue.length === 0) return;
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setSecs((s) => {
        if (s <= 1) {
          setIdx((i) => (i + 1 < queue.length ? i + 1 : i));
          if (idx + 1 >= queue.length) load().catch(() => {});
          return TIMEOUT_S;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length, idx]);

  const current = queue[idx];
  const distKm =
    current?.lat != null && current?.lng != null && proLive.lastFix
      ? kmBetween(proLive.lastFix.latitude, proLive.lastFix.longitude, current.lat, current.lng)
      : null;

  const next = () => {
    if (idx + 1 < queue.length) {
      setIdx(idx + 1);
      setSecs(TIMEOUT_S);
    } else {
      load().catch(() => {});
    }
  };

  const accept = async () => {
    if (!current || !pid || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await patchBooking(authFetch, current.id, { status: 'accepted' as any });
      attachBookingToPro(current.id, pid);
      emitBookingStatus(current.id, 'accepted');
      logBookingEvent(authFetch, current.id, 'accepted', { note: 'Aceptado por el profesional' }).catch(() => {});
      router.push(`/booking/${current.id}`);
    } catch (e: any) {
      setMsg(e.message || 'No se pudo aceptar.');
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    if (!current || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await patchBooking(authFetch, current.id, { status: 'rejected' as any });
      emitBookingStatus(current.id, 'rejected');
      logBookingEvent(authFetch, current.id, 'rejected', { note: 'Rechazado por el profesional' }).catch(() => {});
      next();
    } catch (e: any) {
      setMsg(e.message || 'No se pudo rechazar.');
    } finally {
      setBusy(false);
    }
  };

  const cop = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 30 }}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backT}>← Perfil</Text>
      </Pressable>
      <Text style={styles.h1}>Solicitud entrante</Text>
      <Text style={styles.sub}>Responde antes de que el turno pase al siguiente profesional.</Text>

      {!isProfessional || !pid ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Aún no eres profesional</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.replace('/(tabs)/profile')}>
            <Text style={styles.primaryT}>Ir a mi perfil →</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} />
      ) : !current ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔕 Sin solicitudes</Text>
          <Text style={styles.sub}>Quédate online: las nuevas llegan en vivo por socket.</Text>
          <Pressable style={styles.ghostBtn} onPress={() => { setLoading(true); load().finally(() => setLoading(false)); }}>
            <Text style={styles.ghostT}>↻ Buscar ahora</Text>
          </Pressable>
          {!proLive.isOnline && (
            <Pressable style={styles.primaryBtn} onPress={() => proLive.setOnline(true)}>
              <Text style={styles.primaryT}>Ponerme online 📡</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <>
          <View style={styles.timerCard}>
            <Text style={styles.timerLabel}>TIEMPO PARA RESPONDER</Text>
            <Text style={styles.timer}>{mmss}</Text>
            <Text style={styles.sub}>
              Solicitud {idx + 1} de {queue.length} · LK-{current.id}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.svc}>{current.serviceName}</Text>
            <Text style={styles.client}>
              👤 {current.clientName}
              {distKm != null ? ` · 📍 a ${distKm.toFixed(1)} km` : ''}
            </Text>
            <Text style={styles.sub}>📍 {current.address}</Text>
            <View style={styles.money}>
              <View>
                <Text style={styles.moneyL}>Facturado al cliente</Text>
                <Text style={styles.moneyV}>{cop(current.total)} COP</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.moneyL}>Tu ganancia neta (85%)</Text>
                <Text style={[styles.moneyV, { color: Stitch.colors.onTertiaryContainer }]}>
                  {cop(current.net)} COP
                </Text>
              </View>
            </View>
            {msg ? <Text style={styles.msg}>{msg}</Text> : null}
            <Pressable style={styles.acceptBtn} onPress={accept} disabled={busy}>
              <Text style={styles.acceptT}>{busy ? 'Procesando…' : '✓ Aceptar servicio'}</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={decline} disabled={busy}>
              <Text style={styles.ghostT}>✕ Rechazar y pasar turno</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Stitch.colors.surface },
  back: { paddingHorizontal: 16, paddingTop: 16 },
  backT: { fontWeight: '700', color: Stitch.colors.onSurfaceVariant },
  h1: { fontSize: 24, fontWeight: '800', color: Stitch.colors.onSurface, paddingHorizontal: 16, paddingTop: 4 },
  sub: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, paddingHorizontal: 16, marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginTop: 12, padding: 16, gap: 8, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Stitch.colors.onSurface },
  timerCard: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 16, marginHorizontal: 16, marginTop: 12, padding: 16, alignItems: 'center', gap: 2 },
  timerLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: Stitch.colors.surfaceHigh },
  timer: { fontSize: 32, fontWeight: '900', color: Stitch.colors.secondaryContainer },
  svc: { fontSize: 18, fontWeight: '800', color: Stitch.colors.onSurface },
  client: { fontSize: 14, fontWeight: '700', color: Stitch.colors.onSurface },
  money: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, padding: 12, marginTop: 4 },
  moneyL: { fontSize: 11, color: Stitch.colors.onSurfaceVariant },
  moneyV: { fontSize: 17, fontWeight: '900', color: Stitch.colors.onSurface },
  msg: { color: Stitch.colors.error, fontWeight: '600', fontSize: 12 },
  acceptBtn: { backgroundColor: Stitch.colors.secondaryContainer, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 4 },
  acceptT: { color: Stitch.colors.primaryContainer, fontWeight: '900' },
  primaryBtn: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 8 },
  primaryT: { color: '#fff', fontWeight: '800' },
  ghostBtn: { borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 4 },
  ghostT: { fontWeight: '700', color: Stitch.colors.onSurface, fontSize: 13 },
});
