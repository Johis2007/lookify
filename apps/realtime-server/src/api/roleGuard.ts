import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Pool } from 'pg';
import { AuthError, verifyAccessToken, type AuthedUser } from '../auth.js';
import type { AuthedRequest } from './http.js';

// Guard de rol del BFF (QA-2.3).
//
// El JWT de Directus identifica al usuario, pero no basta: el BFF solo debe
// aceptar al rol App User (o a un admin). Este módulo centraliza la decisión
// para HTTP y para el handshake de Socket.IO.
//
// - El claim `role` del token es la vía rápida. Si no viene, se consulta
//   `directus_users.role` (caché de 30 s) para no golpear la base por request.
// - Sin APP_ROLE_ID el guard falla cerrado: niega todo salvo las rutas exentas.
// - Exentos: /health y /api/auth/register (registro público).

export const ROLE_GUARD_MARKER = Symbol.for('lookify.roleGuard');

const EXEMPT_PATHS = new Set(['/health', '/api/auth/register']);
const DEFAULT_CACHE_TTL_MS = 30_000;

type RolePool = Pick<Pool, 'query'>;

export type RolePolicyOptions = {
  pool: RolePool;
  appRoleId?: string | null;
  cacheTtlMs?: number;
  now?: () => number;
};

export type RolePolicy = {
  configured: boolean;
  isAllowed: (user: AuthedUser) => Promise<boolean>;
  resolveRole: (userId: string) => Promise<string | null>;
};

export function isRoleGuardExemptPath(path: string): boolean {
  const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return EXEMPT_PATHS.has(normalized);
}

export function createRolePolicy(options: RolePolicyOptions): RolePolicy {
  const rawAppRoleId =
    options.appRoleId === undefined ? process.env.APP_ROLE_ID : options.appRoleId;
  const appRoleId = (rawAppRoleId ?? '').trim();
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { role: string | null; expiresAt: number }>();

  async function resolveRole(userId: string): Promise<string | null> {
    const hit = cache.get(userId);
    if (hit && hit.expiresAt > now()) return hit.role;
    const { rows } = await options.pool.query<{ role: string | null }>(
      'SELECT role FROM directus_users WHERE id = $1 LIMIT 1',
      [userId],
    );
    const role = rows[0]?.role ?? null;
    cache.set(userId, { role, expiresAt: now() + cacheTtlMs });
    return role;
  }

  return {
    configured: Boolean(appRoleId),
    resolveRole,
    async isAllowed(user: AuthedUser): Promise<boolean> {
      if (!appRoleId) return false;
      if (user.isAdmin) return true;
      const role = user.role || (await resolveRole(user.userId));
      return role === appRoleId;
    },
  };
}

export type RoleGuardOptions = {
  policy: RolePolicy;
  directusSecret?: string;
};

function rejectAuth(res: Response, error: string): void {
  res.status(401).json({ error });
}

export function createRoleGuard(options: RoleGuardOptions): RequestHandler {
  const middleware = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (isRoleGuardExemptPath(req.path)) {
      next();
      return;
    }

    const header = req.headers.authorization || '';
    const match = /^Bearer (.+)$/.exec(header.trim());
    if (!match) {
      rejectAuth(res, 'unauthorized');
      return;
    }

    let user: AuthedUser;
    try {
      const secret =
        options.directusSecret ?? (req.app.locals.directusSecret as string);
      user = verifyAccessToken(match[1], secret);
    } catch (e) {
      const code = e instanceof AuthError ? e.code : 'UNAUTHORIZED';
      rejectAuth(res, code.toLowerCase());
      return;
    }
    req.user = user;

    if (!options.policy.configured) {
      res.status(503).json({ error: 'role_guard_unconfigured' });
      return;
    }

    try {
      if (await options.policy.isAllowed(user)) {
        next();
        return;
      }
      res.status(403).json({ error: 'forbidden' });
    } catch {
      res.status(503).json({ error: 'role_guard_unavailable' });
    }
  };

  Object.defineProperty(middleware, ROLE_GUARD_MARKER, { value: true });
  return middleware;
}

export type SocketAuthLike = {
  handshake: { auth?: unknown };
  data: { user?: AuthedUser };
};

export type SocketAuthGuardOptions = {
  directusSecret: string;
  policy: RolePolicy;
  onReject?: (code: string, err?: Error) => void;
};

export function createSocketAuthGuard(
  options: SocketAuthGuardOptions,
): (socket: SocketAuthLike, next: (err?: Error) => void) => Promise<void> {
  return async (socket, next) => {
    const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    if (typeof token !== 'string' || !token) {
      options.onReject?.('UNAUTHORIZED');
      next(new Error('UNAUTHORIZED'));
      return;
    }

    let user: AuthedUser;
    try {
      user = verifyAccessToken(token, options.directusSecret);
    } catch (e) {
      const code = e instanceof AuthError ? e.code : 'UNAUTHORIZED';
      options.onReject?.(code, e instanceof Error ? e : undefined);
      next(new Error(code));
      return;
    }
    socket.data.user = user;

    if (!options.policy.configured) {
      options.onReject?.('ROLE_GUARD_UNCONFIGURED');
      next(new Error('FORBIDDEN'));
      return;
    }

    try {
      if (await options.policy.isAllowed(user)) {
        next();
        return;
      }
      options.onReject?.('FORBIDDEN');
      next(new Error('FORBIDDEN'));
    } catch (e) {
      options.onReject?.('ROLE_GUARD_UNAVAILABLE', e instanceof Error ? e : undefined);
      next(new Error('FORBIDDEN'));
    }
  };
}
