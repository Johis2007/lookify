import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { readItems, readJson } from '@/lib/http';
import { useProLiveState } from '@/lib/proLiveState';

/* eslint-disable react-hooks/set-state-in-effect */
// Carga inicial desde Directus (sistema externo), igual que el resto de pantallas.

const DOC_STATUS_LABEL: Record<string, string> = {
  pending: 'En revisión',
  verified: 'Aprobado',
  rejected: 'Rechazado',
};

/**
 * Sala de espera del profesional (lista de espera para revisión documental).
 *
 * Toda cuenta profesional con verification_status distinto de 'verified'
 * queda aquí: sin solicitudes, sin online, sin métricas operativas, hasta que
 * el administrador apruebe su documento desde /admin/verification.
 * Muestra posición en la cola, estado del documento y botón de actualizar.
 */
export function PendingGate({ children }: { children: React.ReactNode }) {
  const { authFetch, logout } = useAuth();
  const proLive = useProLiveState();
  const pid = proLive.professionalId;
  const [position, setPosition] = useState<number | null>(null);
  const [queueTotal, setQueueTotal] = useState<number | null>(null);
  const [docStatus, setDocStatus] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!pid) return;
    try {
      const me = await authFetch(
        `/items/beauty_professionals/${pid}?fields=date_created,verification_note`
      );
      const row = me.ok ? (await readJson<{ data?: any }>(me))?.data : null;
      if (typeof row?.verification_note === 'string' && row.verification_note) {
        setNote(row.verification_note);
      }
      const mine = row?.date_created ? new Date(row.date_created).getTime() : null;
      const q = await authFetch(
        '/items/beauty_professionals?filter[verification_status][_eq]=pending&fields=id,date_created&limit=500&sort=date_created'
      );
      const list = await readItems<any>(q);
      setQueueTotal(list.length);
      if (mine != null && Number.isFinite(mine)) {
        const ahead = list.filter((x: any) => {
          const t = new Date(x.date_created).getTime();
          return Number.isFinite(t) && t < mine;
        }).length;
        setPosition(ahead + 1);
      } else {
        setPosition(null);
      }
      const d = await authFetch(
        `/items/professional_documents?filter[professional][_eq]=${pid}&fields=status&limit=1&sort=-id`
      );
      const docs = await readItems<any>(d);
      if (docs.length && typeof docs[0].status === 'string') setDocStatus(docs[0].status);
    } catch {
      /* best-effort: la sala se muestra igual sin posición */
    }
  }, [authFetch, pid]);

  useEffect(() => {
    if (pid) load().catch(() => {});
  }, [pid, load]);

  if (!pid) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.centerT}>Verificando tu cuenta profesional…</Text>
      </View>
    );
  }
  if (proLive.verification === 'verified') return <>{children}</>;

  const rejected = proLive.verification === 'rejected';

  const refresh = async () => {
    setRefreshing(true);
    try {
      await proLive.reload();
      await load();
    } finally {
      setRefreshing(false);
    }
  };
  const signOut = async () => {
    try {
      await logout();
    } catch {
      // Igual se vuelve al login compartido (Cliente/Profesional/Admin).
    } finally {
      router.replace('/(auth)/login');
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.wrap}>
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>{rejected ? '❌' : '⏳'}</Text>
        <Text style={styles.heroTitle}>
          {rejected ? 'Documentación rechazada' : 'Estás en lista de espera'}
        </Text>
        <Text style={styles.heroSub}>
          {rejected
            ? 'El administrador encontró un problema con tu documento. Revisa el motivo abajo.'
            : 'Tu documento está en cola para revisión. No podrás recibir solicitudes hasta la aprobación.'}
        </Text>
        {!rejected && (
          <View style={styles.posPill}>
            <Text style={styles.posT}>
              {position != null ? `Puesto #${position}` : 'En cola'}
              {queueTotal != null ? ` de ${queueTotal} por revisar` : ''}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Estado de tu verificación</Text>
        <View style={styles.factRow}>
          <Text style={styles.factL}>Documento</Text>
          <Text style={styles.factV}>{docStatus ? DOC_STATUS_LABEL[docStatus] ?? docStatus : 'Recibido'}</Text>
        </View>
        <View style={styles.factRow}>
          <Text style={styles.factL}>Cuenta</Text>
          <Text style={styles.factV}>{rejected ? 'Rechazada' : 'Pendiente'}</Text>
        </View>
        {!!note && (
          <View style={styles.noteBox}>
            <Text style={styles.noteT}>Motivo del administrador:</Text>
            <Text style={styles.noteV}>{note}</Text>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>¿Qué sigue?</Text>
        {(
          rejected
            ? [
              '1. Lee el motivo del rechazo.',
              '2. Prepara un documento válido (certificado, licencia o diploma legible).',
              '3. Escríbenos para reabrir tu verificación con el nuevo documento.',
            ]
            : [
              '1. El administrador revisa tu documento en orden de llegada.',
              '2. Al aprobarte, este panel se convierte en tu dashboard operativo.',
              '3. Pulsa “Actualizar estado” de vez en cuando para ver si ya quedaste.',
            ]
        ).map((s) => (
          <Text key={s} style={styles.stepT}>{s}</Text>
        ))}
        <Pressable style={[styles.primary, refreshing && { opacity: 0.7 }]} onPress={refresh} disabled={refreshing}>
          {refreshing ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryT}>↻ Actualizar estado</Text>}
        </Pressable>
      </View>

      <Pressable style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutT}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Stitch.colors.surface },
  wrap: { padding: 16, paddingBottom: 40, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  centerT: { color: Stitch.colors.onSurfaceVariant },
  hero: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 20, padding: 24, alignItems: 'center', gap: 8 },
  heroIcon: { fontSize: 52 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#fff', textAlign: 'center' },
  heroSub: { fontSize: 13, color: '#b8c7e6', textAlign: 'center', lineHeight: 19 },
  posPill: { backgroundColor: Stitch.colors.secondaryContainer, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16, marginTop: 4 },
  posT: { color: Stitch.colors.primaryContainer, fontWeight: '900', fontSize: 14 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Stitch.colors.onSurface },
  factRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Stitch.colors.surfaceLow, borderRadius: 10, padding: 12 },
  factL: { fontSize: 12, color: Stitch.colors.onSurfaceVariant },
  factV: { fontSize: 13, fontWeight: '800', color: Stitch.colors.onSurface },
  noteBox: { backgroundColor: Stitch.colors.errorContainer, borderRadius: 10, padding: 12, gap: 2 },
  noteT: { fontSize: 11, fontWeight: '800', color: Stitch.colors.onErrorContainer },
  noteV: { fontSize: 13, color: Stitch.colors.onErrorContainer },
  stepT: { fontSize: 13, color: Stitch.colors.onSurfaceVariant, lineHeight: 20 },
  primary: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 8 },
  primaryT: { color: '#fff', fontWeight: '800', fontSize: 15 },
  signOut: { padding: 16, alignItems: 'center' },
  signOutT: { fontWeight: '700', color: Stitch.colors.onSurfaceVariant },
});
