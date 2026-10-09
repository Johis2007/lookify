import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { ConfirmDialog, useConfirm } from '@/components/ConfirmDialog';
import { logBookingEvent, patchBooking } from '@/lib/api';
import { readJson } from '@/lib/http';
import { emitBookingStatus, getSocket } from '@/lib/socket';

type Fase = 'llegada' | 'esperandoPin' | 'servicio' | 'finalizado';

const CHECKLIST = ['Profesional llegó', 'Servicio iniciado', 'Servicio finalizado'] as const;
const NAVY = Stitch.colors.primaryContainer;
const HONEY = Stitch.colors.secondaryContainer;

// PIN determinista por reserva: cliente y profesional ven el mismo código
// sin necesidad de columna nueva en Directus.
function pinForBooking(id: string): string {
  const n = Number.parseInt(id, 10);
  const seed = Number.isFinite(n) ? n : [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  return String(1000 + ((seed * 7919) % 9000));
}

function faseOf(status: string): { fase: Fase; steps: number; pinOk: boolean; progress: number } {
  if (status === 'completed') return { fase: 'finalizado', steps: 3, pinOk: true, progress: 1 };
  if (status === 'in_progress') return { fase: 'servicio', steps: 2, pinOk: true, progress: 0 };
  if (status === 'accepted') return { fase: 'esperandoPin', steps: 1, pinOk: false, progress: 0 };
  return { fase: 'llegada', steps: 0, pinOk: false, progress: 0 };
}

// Lookify - Pantalla 9: Servicio en progreso (diseño mock navy + honey,
// checklist + PIN + progreso; datos reales Directus por id de reserva).
export default function ServiceProgress() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { authFetch } = useAuth();
  const confirm = useConfirm();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const pin = pinForBooking(String(id ?? '0'));

  const refresh = useCallback(async () => {
    try {
      const r = await authFetch(`/items/bookings/${id}?fields=*,service.*,professional.*`);
      if (r.ok) {
        const data = (await readJson<{ data?: any }>(r))?.data;
        if (data) setBooking(data);
      }
    } catch {
      /* sin red: se reintenta en el siguiente ciclo */
    }
  }, [authFetch, id]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await refresh();
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [refresh]);

  // Tiempo real: escucha cambios de estado + polling cada 10s.
  useEffect(() => {
    const t = setInterval(() => {
      refresh().catch(() => {});
    }, 10_000);
    let s: ReturnType<typeof getSocket> | null = null;
    try {
      s = getSocket();
      const onStatus = (p: any) => {
        if (String(p?.booking_id) !== String(id)) return;
        setBooking((b: any) => (b ? { ...b, status: p.status } : b));
      };
      s.on('booking:status', onStatus);
      return () => {
        clearInterval(t);
        s?.off('booking:status', onStatus);
      };
    } catch {
      return () => clearInterval(t);
    }
  }, [id, refresh]);

  // Progreso visual mientras el servicio está en curso (solo UI, como el mock).
  useEffect(() => {
    if (booking?.status !== 'in_progress') return;
    const t = setInterval(() => {
      setProgress((p) => Math.min(0.98, p + 1 / 240));
    }, 250);
    return () => clearInterval(t);
  }, [booking?.status]);

  const startService = async () => {
    if (!booking || busy) return;
    setBusy(true);
    try {
      await patchBooking(authFetch, Number(id), { status: 'in_progress' as any });
      await logBookingEvent(authFetch, Number(id), 'in_progress', {
        note: 'PIN validado: servicio iniciado',
      });
      setBooking({ ...booking, status: 'in_progress' });
      try {
        emitBookingStatus(id as string, 'in_progress');
      } catch {}
    } catch {
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const finishService = async () => {
    if (!booking || busy) return;
    setBusy(true);
    try {
      await patchBooking(authFetch, Number(id), { status: 'completed' as any });
      await logBookingEvent(authFetch, Number(id), 'completed', {
        note: 'Servicio finalizado desde app',
      });
      try {
        emitBookingStatus(id as string, 'completed');
      } catch {}
      router.replace(`/rating/${id}`);
    } catch {
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const cancelService = async () => {
    const ok = await confirm.show(
      '¿Cancelar servicio?',
      'El profesional será notificado. Pueden aplicar cargos si ya inició.',
      { destructive: true }
    );
    if (!ok) return;
    setBusy(true);
    try {
      await patchBooking(authFetch, Number(id), { status: 'cancelled' as any });
      await logBookingEvent(authFetch, Number(id), 'cancelled', {
        note: 'Cancelado desde progreso del servicio',
      });
      try {
        emitBookingStatus(id as string, 'cancelled');
      } catch {}
      router.replace('/(tabs)/bookings');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={HONEY} />
        <Text style={styles.centerT}>Cargando servicio…</Text>
      </View>
    );
  }
  if (!booking) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerT}>No se encontró la reserva #{id}</Text>
        <Pressable style={styles.ghostBtn} onPress={() => router.replace('/(tabs)/bookings')}>
          <Text style={styles.ghostT}>Volver a mis reservas</Text>
        </Pressable>
      </View>
    );
  }

  const svcName =
    typeof booking.service === 'object' ? booking.service?.name : `Servicio #${booking.service}`;
  const durationMin =
    typeof booking.service === 'object' ? booking.service?.duration_min : undefined;
  const derived = faseOf(String(booking.status));
  const pct = Math.round((booking.status === 'completed' ? 1 : progress) * 100);
  const showPin = derived.fase === 'esperandoPin';
  const showProgress = derived.fase === 'servicio' || derived.fase === 'finalizado';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.icon}>⏱️</Text>
        <Text style={styles.title}>{svcName}</Text>
        <Text style={styles.subtitle}>
          {durationMin ? `Duración acordada: ${durationMin} min` : `Reserva #${booking.id}`}
        </Text>

        {showPin ? (
          <View style={styles.pinBlock}>
            <Text style={styles.pinHeading}>Código para iniciar</Text>
            <View accessible accessibilityRole="text" accessibilityLabel={`Código ${pin.split('').join(' ')}`}>
              <Text style={styles.pinDigits}>{pin.split('').join('  ')}</Text>
            </View>
            <Text style={styles.pinHint}>
              Comparte este código con tu profesional para que inicie el servicio.
            </Text>
            <Text style={styles.pinWaiting}>Esperando que el profesional ingrese el código</Text>
            <Pressable
              style={[styles.primaryBtn, busy && { opacity: 0.7 }]}
              onPress={startService}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={NAVY} />
              ) : (
                <Text style={styles.primaryT}>El profesional llegó — iniciar servicio</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={styles.pinSpacer} />
        )}

        {showProgress ? (
          <View style={styles.progressBlock}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.progressLabel}>{pct}%</Text>
          </View>
        ) : (
          <View style={styles.progressSpacer} />
        )}

        <View style={styles.checklist}>
          {CHECKLIST.map((label, i) => {
            const done = derived.steps > i;
            return (
              <View key={label} style={styles.checkRow}>
                <View style={[styles.checkDot, done && styles.checkDotDone]}>
                  {done && <Text style={styles.checkMark}>✓</Text>}
                </View>
                <Text style={[styles.checkText, done && styles.checkTextDone]}>{label}</Text>
              </View>
            );
          })}
        </View>

        {derived.fase === 'servicio' && (
          <Pressable
            style={[styles.primaryBtn, styles.finishBtn, busy && { opacity: 0.7 }]}
            onPress={finishService}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={NAVY} />
            ) : (
              <Text style={styles.primaryT}>Marcar servicio finalizado →</Text>
            )}
          </Pressable>
        )}
        {derived.fase === 'finalizado' && (
          <Pressable style={[styles.primaryBtn, styles.finishBtn]} onPress={() => router.replace(`/rating/${id}`)}>
            <Text style={styles.primaryT}>Ir a calificación →</Text>
          </Pressable>
        )}

        {!derived.pinOk && booking.status !== 'cancelled' && booking.status !== 'completed' ? (
          <Pressable style={styles.cancelButton} onPress={cancelService} disabled={busy}>
            <Text style={styles.cancelButtonText}>Cancelar servicio</Text>
          </Pressable>
        ) : null}

        <Pressable style={styles.ghostBtn} onPress={() => router.push(`/booking/${id}`)}>
          <Text style={styles.ghostT}>Ver seguimiento en vivo</Text>
        </Pressable>
      </ScrollView>
      <ConfirmDialog {...confirm.dialogProps} confirmLabel="Sí, cancelar" destructive />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  center: { flex: 1, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  centerT: { color: '#fff', fontSize: 14 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 24, alignItems: 'center' },
  icon: { fontSize: 56, textAlign: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: '#fff', textAlign: 'center', marginTop: 12 },
  subtitle: { fontSize: 14, color: '#FFE9C2', opacity: 0.75, marginTop: 4, marginBottom: 12 },
  pinBlock: { alignSelf: 'stretch', marginBottom: 20, alignItems: 'center', gap: 6 },
  pinSpacer: { height: 8, marginBottom: 12 },
  pinHeading: { fontSize: 14, fontWeight: '600', color: '#FFE9C2', opacity: 0.75 },
  pinDigits: { fontSize: 40, fontWeight: '700', color: HONEY, letterSpacing: 2, textAlign: 'center' },
  pinHint: { fontSize: 13, color: '#FFE9C2', opacity: 0.75, textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 },
  pinWaiting: { fontSize: 14, color: '#fff', textAlign: 'center', marginTop: 8, fontWeight: '500' },
  primaryBtn: {
    backgroundColor: HONEY,
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 12,
  },
  primaryT: { color: NAVY, fontWeight: '900', fontSize: 14 },
  finishBtn: { marginTop: 16 },
  progressBlock: { alignSelf: 'stretch', marginBottom: 24 },
  progressSpacer: { height: 24, marginBottom: 16 },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: '#ffffff26', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: HONEY, borderRadius: 999 },
  progressLabel: { fontSize: 13, color: '#FFE9C2', opacity: 0.75, textAlign: 'center', marginTop: 8 },
  checklist: { alignSelf: 'stretch', gap: 14 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#FFE9C2',
    opacity: 0.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDotDone: { backgroundColor: HONEY, borderColor: HONEY, opacity: 1 },
  checkMark: { color: NAVY, fontWeight: '900', fontSize: 13 },
  checkText: { flex: 1, fontSize: 15, color: '#FFE9C2', opacity: 0.6 },
  checkTextDone: { color: '#fff', opacity: 1, fontWeight: '600' },
  cancelButton: {
    alignSelf: 'stretch',
    marginTop: 'auto',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FFE9C2',
    opacity: 0.9,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: { fontWeight: '700', fontSize: 14, color: '#fff' },
  ghostBtn: { alignItems: 'center', padding: 10 },
  ghostT: { fontWeight: '700', color: '#FFE9C2', opacity: 0.8, fontSize: 13 },
});
