import type { NextFunction, Request, Response } from 'express';
import { AuthError, verifyAccessToken, type AuthedUser } from '../auth.js';

// Error de dominio con código HTTP. El router lo traduce a JSON { error }.
export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

// Express adjunta el usuario verificado a req.user.
export type AuthedRequest = Request & { user?: AuthedUser };

// Middleware de autenticación: Bearer <access token de Directus>.
// La identidad SIEMPRE sale del token; nunca del body/query.
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const match = /^Bearer (.+)$/.exec(header.trim());
  if (!match) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    req.user = verifyAccessToken(match[1], req.app.locals.directusSecret as string);
    next();
  } catch (e) {
    const code = e instanceof AuthError ? e.code : 'UNAUTHORIZED';
    res.status(code === 'TOKEN_EXPIRED' ? 401 : 401).json({ error: code.toLowerCase() });
  }
}

// Envuelve un handler async para que sus rechazos lleguen al error handler.
export function asyncHandler(
  fn: (req: AuthedRequest, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req as AuthedRequest, res, next).catch(next);
  };
}

// Handler de errores final: HttpError -> su status; el resto, 500.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code });
    return;
  }
  if (process.env.DEBUG_BFF) {
    console.error('[bff]', err);
  }
  res.status(500).json({ error: 'internal_error' });
}
