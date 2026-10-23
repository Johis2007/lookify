import { Router, type Request, type Response as ExpressResponse } from 'express';
import { z } from 'zod';
import { adminFetch } from './directusAdmin.js';
import { asyncHandler, HttpError } from './http.js';

const RegisterBody = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(8).max(128),
    firstName: z.string().trim().min(1).max(80),
  })
  .strict();

export type RegisterRouterOptions = {
  appRoleId?: string;
  maxPerWindow?: number;
  windowMs?: number;
};

type Bucket = { count: number; windowStart: number };

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function registerRateLimit(maxPerWindow: number, windowMs: number) {
  const buckets = new Map<string, Bucket>();
  return (req: Request, res: ExpressResponse, next: () => void): void => {
    const key = req.ip || 'anonymous';
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStart > windowMs) {
      buckets.set(key, { count: 1, windowStart: now });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > maxPerWindow) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    next();
  };
}

async function readJsonSafe(res: globalThis.Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function createRegisterRouter(options: RegisterRouterOptions = {}): Router {
  const router = Router();
  const maxPerWindow =
    options.maxPerWindow ??
    positiveInt(process.env.BFF_REGISTER_RATE_MAX, 5);
  const windowMs =
    options.windowMs ??
    positiveInt(process.env.BFF_REGISTER_RATE_WINDOW_MS, 15 * 60_000);

  router.post(
    '/register',
    registerRateLimit(maxPerWindow, windowMs),
    asyncHandler(async (req: Request, res: ExpressResponse) => {
      const parsed = RegisterBody.safeParse(req.body ?? {});
      if (!parsed.success) throw new HttpError(400, 'invalid_body');

      const appRoleId = (options.appRoleId ?? process.env.APP_ROLE_ID ?? '').trim();
      if (!appRoleId) throw new HttpError(503, 'registration_unavailable');

      const { email, password, firstName } = parsed.data;
      const created = await adminFetch('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          first_name: firstName,
          role: appRoleId,
          status: 'active',
        }),
      });
      const payload = await readJsonSafe(created);

      if (!created.ok) {
        const detail = JSON.stringify(payload ?? '');
        if (created.status === 400 && /unique|RECORD_NOT_UNIQUE|already exists/i.test(detail)) {
          throw new HttpError(409, 'email_duplicate');
        }
        throw new HttpError(502, 'registration_failed');
      }

      const id =
        payload && typeof payload === 'object' && 'data' in payload
          ? (payload as { data?: { id?: unknown } }).data?.id
          : undefined;
      res.status(201).json({
        data: {
          ...(typeof id === 'string' ? { id } : {}),
          email,
          firstName,
        },
      });
    }),
  );

  return router;
}
