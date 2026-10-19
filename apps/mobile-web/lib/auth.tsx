import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { directusFetch } from './endpoints';
import { disconnectSocket, ensureSocketEndpoint, setAuthExpiredHandler, setSocketToken } from './socket';
import { readJson } from './http';

export type LookifyUser = {
  id: string;
  email: string;
  first_name?: string;
};

type AuthContextValue = {
  user: LookifyUser | null;
  isProfessional: boolean;
  /** Rol administrador de Directus (único con acceso a /admin). */
  isAdmin: boolean;
  /** Cuenta con marcas de cliente y profesional: opera solo como profesional. */
  roleConflict: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ isProfessional: boolean; isAdmin: boolean }>;
  registerClient: (email: string, password: string, displayName: string, phone?: string) => Promise<void>;
  registerProfessional: (args: {
    email: string;
    password: string;
    displayName: string;
    specialties: string;
    yearsExp: number;
    phone: string;
    docType: string;
    doc: { uri: string; name: string; mimeType: string };
  }) => Promise<{ professionalId: number }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ACCESS_KEY = 'lookify_access_token';
const REFRESH_KEY = 'lookify_refresh_token';

async function save(key: string, value: string) {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}
async function load(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}
async function del(key: string) {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

async function api(path: string, token: string | null, init?: RequestInit) {
  const isForm = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  // No fijar Content-Type en multipart: fetch genera el boundary.
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  // directusFetch prueba la URL primaria y hace fallback a la otra red
  // (casa/universidad) ante fallo de conexión, sin romper la sesión.
  return directusFetch(path, { ...init, headers });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LookifyUser | null>(null);
  const [isProfessional, setIsProfessional] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  // Cuenta con marcas de AMBOS roles (cliente y profesional). Las actividades
  // no se mezclan: estas cuentas operan como profesional y se les avisa que
  // usen una cuenta cliente aparte para reservar.
  const [roleConflict, setRoleConflict] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async (token: string) => {
    // /users/me PLANO: pedir expansiones (role.*) exige permiso de lectura
    // sobre directus_roles, que el rol "App User" no tiene -> 403 y sesión
    // invalidada. El admin se detecta con sonda aparte (ver abajo).
    const res = await api('/users/me', token);
    if (!res.ok) throw new Error('SESSION_INVALID');
    const me = (await readJson<{ data?: any }>(res))?.data;
    if (!me?.id) throw new Error('SESSION_INVALID');
    const u: LookifyUser = {
      id: me.id,
      email: me.email,
      first_name: me.first_name,
    };
    setUser(u);
    // Sondas de rol en paralelo (best-effort: ninguna rompe la sesión).
    const [proRows, adminOk, clientMarked] = await Promise.all([
      // Rol profesional = existe fila en beauty_professionals para este user.
      api(`/items/beauty_professionals?filter[user][_eq]=${u.id}&fields=id&limit=1`, token)
        .then(async (p) => (p.ok ? ((await readJson<{ data?: unknown[] }>(p))?.data ?? []) : []))
        .catch(() => [] as unknown[]),
      // Admin = puede leer /permissions (solo admin_access; App User -> 403).
      api('/permissions?limit=1&fields=id', token)
        .then((r) => r.ok)
        .catch(() => false),
      // Marcas de cliente = perfil cliente o al menos una reserva como cliente.
      (async () => {
        try {
          const cp = await api(`/items/client_profiles?filter[user][_eq]=${u.id}&fields=id&limit=1`, token);
          const cj = cp.ok ? (await readJson<{ data?: unknown[] }>(cp))?.data : null;
          if (Array.isArray(cj) && cj.length > 0) return true;
          const bk = await api(`/items/bookings?filter[client][_eq]=${u.id}&fields=id&limit=1`, token);
          const bj = bk.ok ? (await readJson<{ data?: unknown[] }>(bk))?.data : null;
          return Array.isArray(bj) && bj.length > 0;
        } catch {
          return false;
        }
      })(),
    ]);
    const pro = Array.isArray(proRows) && proRows.length > 0;
    setIsProfessional(pro);
    setIsAdmin(adminOk);
    // Exclusividad real: una cuenta no opera en ambos roles a la vez.
    setRoleConflict(pro && clientMarked);
    // Se devuelve el rol detectado para que el login valide la entrada por rol.
    return { user: u, isProfessional: pro, isAdmin: adminOk, roleConflict: pro && clientMarked };
  }, []);

  // Boot: resuelve la red que responde (casa/universidad), restaura sesión o refresca token.
  useEffect(() => {
    (async () => {
      // Warmup multi-IP en paralelo: no bloquea el login si falla.
      ensureSocketEndpoint().catch(() => {});
      try {
        let token = await load(ACCESS_KEY);
        if (token) {
          try {
            await fetchMe(token);
            setAccessToken(token);
            setSocketToken(token);
            return;
          } catch {
            // access expirado: intenta refresh
          }
        }
        const refresh = await load(REFRESH_KEY);
        if (refresh) {
          const res = await api('/auth/refresh', null, {
            method: 'POST',
            body: JSON.stringify({ refresh_token: refresh, mode: 'json' }),
          });
          if (res.ok) {
            const data = (await readJson<{ data?: any }>(res))?.data;
            if (!data?.access_token) throw new Error('SESSION_INVALID');
            await save(ACCESS_KEY, data.access_token);
            await save(REFRESH_KEY, data.refresh_token);
            setAccessToken(data.access_token);
            setSocketToken(data.access_token);
            await fetchMe(data.access_token);
            return;
          }
        }
        await del(ACCESS_KEY);
        await del(REFRESH_KEY);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      let res: Response;
      try {
        res = await api('/auth/login', null, {
          method: 'POST',
          body: JSON.stringify({ email, password, mode: 'json' }),
        });
      } catch {
        throw new Error('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
      }
      if (!res.ok) {
        const err = await readJson<any>(res);
        const code = err?.errors?.[0]?.extensions?.code;
        // Solo cuando la base de datos confirma credenciales inválidas.
        if (code === 'INVALID_CREDENTIALS') {
          throw new Error('Correo o contraseña incorrectos. Inténtalo de nuevo.');
        }
        if (res.status === 429) throw new Error('Demasiados intentos. Espera unos minutos.');
        if (res.status === 403) throw new Error('Servicio no disponible por el momento. Intenta más tarde.');
        if (res.status >= 500) throw new Error('Error del servidor. Intenta más tarde.');
        throw new Error(err?.errors?.[0]?.message ?? 'No se pudo iniciar sesión.');
      }
      const data = (await readJson<{ data?: any }>(res))?.data;
      if (!data?.access_token) throw new Error('Respuesta de sesión inválida.');
      await save(ACCESS_KEY, data.access_token);
      await save(REFRESH_KEY, data.refresh_token);
      setAccessToken(data.access_token);
      setSocketToken(data.access_token);
      const me = await fetchMe(data.access_token);
      return { isProfessional: me.isProfessional, isAdmin: me.isAdmin };
    },
    [fetchMe]
  );

  // FLUJO CLIENTE: crea usuario + login + perfil cliente (fija el rol).
  const registerClient = useCallback(
    async (email: string, password: string, displayName: string, phone?: string) => {
      // Registro público: SIN token (un token caducado lo convertiría en 401).
      // Directus responde 204 sin body en registro público.
      let res: Response;
      try {
        res = await api('/users', null, {
          method: 'POST',
          body: JSON.stringify({ email, password, first_name: displayName }),
        });
      } catch {
        throw new Error('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
      }
      if (!res.ok) {
        const err = await readJson<any>(res);
        const raw = JSON.stringify(err ?? '');
        // Sin licencia Directus solo hay 3 seats: registro lleno = mensaje claro.
        if (raw.includes('LIMIT_EXCEEDED') || raw.includes('seats limit')) {
          throw new Error('Cupo de usuarios lleno por el momento. Escríbenos y te avisamos.');
        }
        throw new Error(
          err?.errors?.[0]?.message ??
            'No se pudo registrar. Habilita registro público en Directus.'
        );
      }
      await login(email, password);
      // Perfil cliente: marca el rol (best-effort; el gate también mira reservas).
      try {
        const token = await load(ACCESS_KEY);
        const meRes = await api('/users/me', token);
        const me = (await readJson<{ data?: any }>(meRes))?.data;
        if (me?.id) {
          await api('/items/client_profiles', token, {
            method: 'POST',
            body: JSON.stringify({
              user: me.id,
              display_name: displayName,
              ...(phone?.trim() ? { phone: phone.trim() } : {}),
            }),
          }).catch(() => null);
        }
      } catch {
        /* el perfil cliente se crea al primer uso */
      }
      await refreshProfileSafe();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchMe, login]
  );

  // FLUJO PROFESIONAL: usuario + login + perfil (pending) + documento.
  // Todo en una cadena: si algo falla se avisa en qué paso quedó.
  const registerProfessional = useCallback(
    async (args: {
      email: string;
      password: string;
      displayName: string;
      specialties: string;
      yearsExp: number;
      phone: string;
      docType: string;
      doc: { uri: string; name: string; mimeType: string };
    }) => {
      // Documento OBLIGATORIO: sin archivo no se crea la cuenta profesional.
      if (!args.doc?.uri || !args.doc?.name) {
        throw new Error('El documento es obligatorio: sube tu certificado, licencia o diploma.');
      }
      let res: Response;
      try {
        res = await api('/users', null, {
          method: 'POST',
          body: JSON.stringify({ email: args.email, password: args.password, first_name: args.displayName }),
        });
      } catch {
        throw new Error('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
      }
      if (!res.ok) {
        const err = await readJson<any>(res);
        const raw = JSON.stringify(err ?? '');
        if (raw.includes('LIMIT_EXCEEDED') || raw.includes('seats limit')) {
          throw new Error('Cupo de usuarios lleno por el momento. Escríbenos y te avisamos.');
        }
        throw new Error(err?.errors?.[0]?.message ?? 'No se pudo crear la cuenta.');
      }
      await login(args.email, args.password);
      const token = await load(ACCESS_KEY);
      const meRes = await api('/users/me', token);
      const me = (await readJson<{ data?: any }>(meRes))?.data;
      if (!me?.id) throw new Error('Sesión inválida tras el registro.');
      // 1. Perfil profesional en revisión (no recibe solicitudes hasta aprobar).
      const pr = await api('/items/beauty_professionals', token, {
        method: 'POST',
        body: JSON.stringify({
          user: me.id,
          display_name: args.displayName,
          specialties: args.specialties,
          years_exp: args.yearsExp,
          phone: args.phone,
          is_online: false,
          verification_status: 'pending',
        }),
      });
      if (!pr.ok) throw new Error('Cuenta creada, pero no se pudo crear el perfil profesional.');
      const created = (await readJson<{ data?: any }>(pr))?.data;
      const professionalId = Number(created?.id);
      if (!Number.isInteger(professionalId) || professionalId <= 0) {
        throw new Error('Cuenta creada, pero no se pudo crear el perfil profesional.');
      }
      // 2. Subir certificado.
      const form = new FormData();
      // @ts-ignore - React Native FormData acepta {uri, name, type}
      form.append('file', { uri: args.doc.uri, name: args.doc.name, type: args.doc.mimeType });
      const up = await api('/files', token, { method: 'POST', body: form as any });
      if (!up.ok) throw new Error('Cuenta y perfil listos, pero falló subir el documento.');
      const file = (await readJson<{ data?: any }>(up))?.data;
      if (!file?.id) throw new Error('Cuenta y perfil listos, pero falló subir el documento.');
      // 3. Vincular documento como pendiente de revisión.
      const dc = await api('/items/professional_documents', token, {
        method: 'POST',
        body: JSON.stringify({
          professional: professionalId,
          file: file.id,
          doc_type: args.docType,
          status: 'pending',
        }),
      });
      if (!dc.ok) throw new Error('Documento subido, pero no quedó vinculado. Intenta de nuevo.');
      await refreshProfileSafe();
      return { professionalId };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchMe, login]
  );

  const refreshProfileSafe = useCallback(async () => {
    const token = (await load(ACCESS_KEY)) ?? accessToken;
    if (token && user) {
      try {
        await fetchMe(token);
      } catch {
        /* noop */
      }
    }
  }, [accessToken, fetchMe, user]);

  const logout = useCallback(async () => {
    try {
      const refresh = await load(REFRESH_KEY);
      if (refresh) {
        await api('/auth/logout', null, {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refresh }),
        });
      }
    } finally {
      await del(ACCESS_KEY);
      await del(REFRESH_KEY);
      setAccessToken(null);
      setUser(null);
      setIsProfessional(false);
      setIsAdmin(false);
      setRoleConflict(false);
      disconnectSocket();
    }
  }, []);

  // Fase 7: si el realtime rechaza el socket por token expirado, refresca la
  // sesión y reconecta con el token nuevo (sin desloguear al usuario).
  const refreshingRef = useRef(false);
  useEffect(() => {
    setAuthExpiredHandler(() => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      void (async () => {
        try {
          const refresh = await load(REFRESH_KEY);
          if (!refresh) {
            await logout();
            return;
          }
          const res = await api('/auth/refresh', null, {
            method: 'POST',
            body: JSON.stringify({ refresh_token: refresh, mode: 'json' }),
          });
          if (!res.ok) {
            await logout();
            return;
          }
          const data = (await readJson<{ data?: any }>(res))?.data;
          if (!data?.access_token) {
            await logout();
            return;
          }
          await save(ACCESS_KEY, data.access_token);
          await save(REFRESH_KEY, data.refresh_token);
          setAccessToken(data.access_token);
          await fetchMe(data.access_token);
          setSocketToken(data.access_token);
        } catch {
          await logout();
        } finally {
          refreshingRef.current = false;
        }
      })();
    });
    return () => setAuthExpiredHandler(null);
  }, [fetchMe, logout]);

  const authFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      const token = (await load(ACCESS_KEY)) ?? accessToken;
      return api(path, token, init);
    },
    [accessToken]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isProfessional,
      isAdmin,
      roleConflict,
      loading,
      login,
      registerClient,
      registerProfessional,
      logout,
      refreshProfile: refreshProfileSafe,
      authFetch,
    }),
    [user, isProfessional, isAdmin, roleConflict, loading, login, registerClient, registerProfessional, logout, refreshProfileSafe, authFetch]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
