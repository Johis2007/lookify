// src/services/backend/initBackend.web.ts
// Variante web: la web es exclusiva del panel administrador. No se registran
// servicios de cliente ni de profesional; el admin habla con Directus/BFF a
// través de lib/backend/admin.ts y adminAuth.ts.

import { BACKEND } from '../../lib/backend/config';

export function isBackendEnabled(): boolean {
  return BACKEND.enabled;
}

/** Idempotente. En web no hay servicios de dominio que enganchar. */
export function initBackend(): void {
  // Intencionalmente vacío: solo admin.
}
