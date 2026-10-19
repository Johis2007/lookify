import React, { createContext, useContext } from 'react';
import { useAuth } from './auth';
import { useProLive } from './proLive';

// Estado online/GPS compartido del profesional: UNA sola instancia del hook
// para toda la app. Sin esto, Perfil + Disponibilidad montarían dos watchers
// GPS (doble batería y el rate-limit del servidor banearía el segundo).
type ProLive = ReturnType<typeof useProLive>;

const ProLiveCtx = createContext<ProLive | null>(null);

export function ProLiveProvider({ children }: { children: React.ReactNode }) {
  const { authFetch, user, isProfessional } = useAuth();
  const value = useProLive(authFetch, user?.id, isProfessional);
  return <ProLiveCtx.Provider value={value}>{children}</ProLiveCtx.Provider>;
}

export function useProLiveState(): ProLive {
  const v = useContext(ProLiveCtx);
  if (!v) throw new Error('useProLiveState debe usarse dentro de <ProLiveProvider>');
  return v;
}
