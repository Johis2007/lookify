import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ProProfileView } from '@/components/ProProfile';
import { confirmNative } from '@/components/ConfirmDialog';
import { useAuth } from '@/lib/auth';
import { readJson } from '@/lib/http';
import { chooseProfessionalPhoto } from '@/lib/permissions';
import { uploadProfessionalAvatar } from '@/lib/professional';
import { useProLiveState } from '@/lib/proLiveState';

// Hub del profesional verificado: su perfil + herramientas operativas.
// (Zona /pro: RoleGate exige rol profesional y PendingGate exige verificación.)
export default function ProProfileScreen() {
  const { user, roleConflict, logout, authFetch } = useAuth();
  const proLive = useProLiveState();
  const [pendingCount, setPendingCount] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [tab, setTab] = useState<'portfolio' | 'services'>('portfolio');

  // Insignia de solicitudes pendientes asignadas al profesional.
  useEffect(() => {
    if (!proLive.professionalId) return;
    let alive = true;
    authFetch(
      `/items/bookings?filter[professional][_eq]=${proLive.professionalId}&filter[status][_eq]=pending&fields=id&limit=50`
    )
      .then((r) => (r.ok ? readJson(r) : null))
      .then((j) => {
        if (alive && j && Array.isArray(j.data)) setPendingCount(j.data.length);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [authFetch, proLive.professionalId]);

  const pickAvatar = async () => {
    if (!user) return;
    chooseProfessionalPhoto(async (uri) => {
      setBusy(true);
      try {
        const url = await uploadProfessionalAvatar(authFetch, user.id, uri);
        setAvatar(url);
        setMsg('Avatar actualizado ✨');
      } catch (e: any) {
        setMsg(e.message);
      } finally {
        setBusy(false);
      }
    });
  };

  const signOut = async () => {
    const ok = await confirmNative('Cerrar sesión', '¿Seguro que quieres salir de Lookify?', 'Salir');
    if (!ok) return;
    try {
      await logout();
    } catch {
      // Igual se vuelve al login compartido (Cliente/Profesional/Admin).
    } finally {
      router.replace('/(auth)/login');
    }
  };

  return (
    <ProProfileView
      user={user}
      roleConflict={roleConflict}
      signOut={signOut}
      pickAvatar={pickAvatar}
      busy={busy}
      msg={msg}
      avatar={avatar}
      tab={tab}
      setTab={setTab}
      pendingCount={pendingCount}
    />
  );
}
