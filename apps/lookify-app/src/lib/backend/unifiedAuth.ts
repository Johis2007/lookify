// src/lib/backend/unifiedAuth.ts
// UN SOLO LOGIN para los tres roles. Un único /auth/login y ruteo por rol:
// admin (puede listar usuarios) → panel; profesional (fila en
// beauty_professionals) → su ruta post-login; resto → cliente (Home).
// También reanuda sesiones guardadas (con refresh del token si venció).

import { ServiceError } from '../../services/errors';
import {
  SesionProfesional,
} from '../../types/professionalAuth';
import { resolvePostLoginRoute } from '../../navigation/professionalRoutes';
import { api, loginDirectus, refreshAccessToken } from './directus';
import { BACKEND } from './config';
import {
  backendSolicitudId,
  loadBackendSession,
  saveBackendSession,
} from './session';
import {
  ensureClientProfile,
  loadClientSession,
  saveClientSession,
} from './clientAuth';
import { loadAdminSession, saveAdminSession, isAdminToken } from './adminAuth';
import { estadoDesdePro } from '../../services/backend/backendProfessionalAuthService';
import { connectRealtime } from './realtime';
import { DProfessional } from './mapping';

export type RolUsuario = 'admin' | 'pro' | 'client';

export type UniversalSession = {
  rol: RolUsuario;
  email: string;
  nombre: string;
  profesionalId?: string;
  solicitudId?: string;
  proSession?: SesionProfesional;
};

type MeRow = { id: string; first_name?: string; last_name?: string; email?: string };

function displayName(me: MeRow, fallback: string): string {
  return [me.first_name, me.last_name].filter(Boolean).join(' ').trim() || me.email || fallback;
}

async function esAdmin(token: string): Promise<boolean> {
  return isAdminToken(token);
}

/** Un solo login: autentica una vez y resuelve el rol con ese mismo token. */
export async function loginUniversal(email: string, password: string): Promise<UniversalSession> {
  const cleanEmail = email.trim();
  if (!cleanEmail || !password) throw new ServiceError('VALIDATION');
  const { accessToken, refreshToken } = await loginDirectus(cleanEmail, password);
  const me = await api<MeRow>('GET', '/users/me?fields=id,first_name,last_name,email', accessToken);
  const nombre = displayName(me, cleanEmail);
  const refresh = refreshToken ? { refreshToken } : {};

  if (await esAdmin(accessToken)) {
    await saveAdminSession({ token: accessToken, ...refresh, userId: me.id, email: cleanEmail, nombre });
    return { rol: 'admin', email: cleanEmail, nombre };
  }

  const pros = await api<DProfessional[]>(
    'GET',
    `/items/beauty_professionals?filter[user][_eq]=${me.id}&fields=id,display_name,verification_status&limit=1`,
    accessToken,
  );
  const pro = pros[0];
  if (pro) {
    const nombrePro = pro.display_name || nombre;
    const { estado, onboarding } = await estadoDesdePro(accessToken, pro);
    await saveBackendSession({
      token: accessToken,
      ...refresh,
      userId: me.id,
      professionalId: pro.id,
      email: cleanEmail,
      nombre: nombrePro,
    });
    connectRealtime(accessToken);
    const proSession: SesionProfesional = {
      profesionalId: String(pro.id),
      solicitudId: backendSolicitudId(pro.id),
      email: cleanEmail,
      nombre: nombrePro,
      estadoSolicitud: estado,
      profesionalActivado: estado === 'APROBADO',
      ...(onboarding !== undefined ? { onboardingPaso: onboarding } : {}),
    };
    return { rol: 'pro', email: cleanEmail, nombre: nombrePro, profesionalId: String(pro.id), proSession };
  }

  await ensureClientProfile(accessToken, me.id, nombre);
  await saveClientSession({ token: accessToken, ...refresh, userId: me.id, email: cleanEmail, nombre });
  return { rol: 'client', email: cleanEmail, nombre };
}

export type ResumeTarget =
  | { kind: 'admin' }
  | { kind: 'pro'; session: SesionProfesional }
  | { kind: 'client' };

async function validarToken(token: string): Promise<MeRow | null> {
  try {
    return await api<MeRow>('GET', '/users/me?fields=id,first_name,last_name,email', token);
  } catch {
    return null;
  }
}

async function refrescar(
  token: string,
  refresh: string | undefined,
  save: (accessToken: string, refreshToken?: string) => Promise<void>,
): Promise<string | null> {
  if (!refresh) return null;
  try {
    const r = await refreshAccessToken(refresh);
    await save(r.accessToken, r.refreshToken);
    return r.accessToken;
  } catch {
    return null;
  }
}

/** Reanuda la sesión guardada (admin > pro > cliente). null = ir a Login. */
export async function resumeSession(): Promise<ResumeTarget | null> {
  if (!BACKEND.enabled) return null;

  const admin = await loadAdminSession();
  if (admin) {
    let token = await validarToken(admin.token).then((me) => (me ? admin.token : null));
    token ??= await refrescar(admin.token, admin.refreshToken, async (accessToken, refreshToken) => {
      await saveAdminSession({
        ...admin,
        token: accessToken,
        refreshToken: refreshToken ?? admin.refreshToken,
      });
    });
    if (token && (await esAdmin(token))) return { kind: 'admin' };
  }

  const pro = await loadBackendSession();
  if (pro) {
    let token = pro.token;
    if (!(await validarToken(token))) {
      token =
        (await refrescar(pro.token, pro.refreshToken, async (accessToken, refreshToken) => {
          await saveBackendSession({
            ...pro,
            token: accessToken,
            refreshToken: refreshToken ?? pro.refreshToken,
          });
        })) ?? '';
    }
    if (token) {
      try {
        const row = await api<DProfessional>(
          'GET',
          `/items/beauty_professionals/${pro.professionalId}?fields=id,display_name,verification_status`,
          token,
        );
        const { estado, onboarding } = await estadoDesdePro(token, row);
        connectRealtime(token);
        return {
          kind: 'pro',
          session: {
            profesionalId: String(pro.professionalId),
            solicitudId: backendSolicitudId(pro.professionalId),
            email: pro.email,
            nombre: pro.nombre,
            estadoSolicitud: estado,
            profesionalActivado: estado === 'APROBADO',
            ...(onboarding !== undefined ? { onboardingPaso: onboarding } : {}),
          },
        };
      } catch {
        /* token sin alcance: a Login */
      }
    }
  }

  const client = await loadClientSession();
  if (client) {
    let token = client.token;
    if (!(await validarToken(token))) {
      token =
        (await refrescar(client.token, client.refreshToken, async (accessToken, refreshToken) => {
          await saveClientSession({
            ...client,
            token: accessToken,
            refreshToken: refreshToken ?? client.refreshToken,
          });
        })) ?? '';
    }
    if (token) return { kind: 'client' };
  }
  return null;
}

/** Ruta del stack profesional para una sesión pro (reutiliza el router). */
export function proRouteOf(session: SesionProfesional): { screen: string; params: object } {
  const r = resolvePostLoginRoute(session);
  return { screen: r.name, params: r.params };
}
