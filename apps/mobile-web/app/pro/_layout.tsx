import { Stack } from 'expo-router';
import { PendingGate } from '@/components/ProWaitingRoom';
import { RoleGate } from '@/lib/roleGuard';

// Zona PROFESIONAL: dashboard operativo exclusivo (solicitudes, disponibilidad,
// ingresos, perfil profesional). Solo cuentas profesionales; los clientes son
// redirigidos a sus vistas y nunca ven métricas ni herramientas PRO.
// PendingGate: sin verificación aprobada no hay dashboard: la cuenta queda en
// la sala de espera (lista de espera para revisión documental).
export default function ProLayout() {
  return (
    <RoleGate allow="pro">
      <PendingGate>
        <Stack screenOptions={{ headerShown: false }} />
      </PendingGate>
    </RoleGate>
  );
}
