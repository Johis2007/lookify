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
import { DIRECTUS_URL_EXPORT as DIRECTUS_URL } from './directus';
import { disconnectSocket, setAuthExpiredHandler, setSocketToken } from './socket';

export type LookifyUser = {
  id: string;
  email: string;
  first_name?: string;
};

type AuthContextValue = {
  user: LookifyUser | null;
  isProfessional: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
    role: 'client' | 'professional'
  ) => Promise<void>;
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
  return fetch(`${DIRECTUS_URL}${path}`, { ...init, headers });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LookifyUser | null>(null);
  const [isProfessional, setIsProfessional] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async (token: string) => {
    const res = await api('/users/me', token);
    if (!res.ok) throw new Error('SESSION_INVALID');
    const { data } = await res.json();
    const u: LookifyUser = {
      id: data.id,
      email: data.email,
      first_name: data.first_name,
    };
    setUser(u);
    // Rol profesional = existe fila en beauty_professionals para este user.
    try {
      const p = await api(
        `/items/beauty_professionals?filter[user][_eq]=${u.id}&fields=id&limit=1`,
        token
      );
      if (p.ok) {
        const { data: rows } = await p.json();
        setIsProfessional(Array.isArray(rows) && rows.length > 0);
      }
    } catch {
      // Sin permiso de lectura: se asume cliente hasta activar perfil.
      setIsProfessional(false);
    }
    return u;
  }, []);

  // Boot: restaura sesión o refresca token.
  useEffect(() => {
    (async () => {
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
            const { data } = await res.json();
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
      const res = await api('/auth/login', null, {
        method: 'POST',
        body: JSON.stringify({ email, password, mode: 'json' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.errors?.[0]?.message ?? 'Credenciales inválidas');
      }
      const { data } = await res.json();
      await save(ACCESS_KEY, data.access_token);
      await save(REFRESH_KEY, data.refresh_token);
      setAccessToken(data.access_token);
      setSocketToken(data.access_token);
      await fetchMe(data.access_token);
    },
    [fetchMe]
  );

  const register = useCallback(
    async (
      email: string,
      password: string,
      displayName: string,
      role: 'client' | 'professional'
    ) => {
      // Registro público: SIN token (un token caducado lo convertiría en 401).
      // Directus responde 204 sin body en registro público.
      const res = await api('/users', null, {
        method: 'POST',
        body: JSON.stringify({ email, password, first_name: displayName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(
          err?.errors?.[0]?.message ??
            'No se pudo registrar. Habilita registro público en Directus.'
        );
      }
      await login(email, password);
      // Si eligió profesional, crea su perfil (best-effort según permisos).
      if (role === 'professional') {
        try {
          const token = await load(ACCESS_KEY);
          const meRes = await api('/users/me', token);
          const { data: me } = await meRes.json();
          await api('/items/beauty_professionals', token, {
            method: 'POST',
            body: JSON.stringify({
              user: me.id,
              display_name: displayName,
              is_online: false,
            }),
          });
        } catch {
          // Se puede activar luego desde Perfil > Activar perfil.
        }
        await refreshProfileSafe();
      }
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
          const { data } = await res.json();
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
      loading,
      login,
      register,
      logout,
      refreshProfile: refreshProfileSafe,
      authFetch,
    }),
    [user, isProfessional, loading, login, register, logout, refreshProfileSafe, authFetch]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
