// SOLO DEMO, sin seguridad real. La autenticación real (hash, JWT) se implementa en el backend.

export interface MockUserConsentRecord {
  terminos: { version: string; aceptadoEn: string };
  politicaDatos: { version: string; aceptadoEn: string };
}

export interface MockUser {
  email: string;
  password: string;
  nombre: string;
  /** Consentimiento mock; en producción lo registra el backend (sello e IP). */
  consentimiento?: MockUserConsentRecord;
}

const seed: MockUser[] = [
  {
    email: 'cliente@lookify.test',
    password: 'Lookify123',
    nombre: 'Cliente demo',
  },
];

let users: MockUser[] = [...seed];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmailRegistered(email: string): boolean {
  const key = normalizeEmail(email);
  return users.some((u) => u.email === key);
}

export function findMockUser(email: string, password: string): MockUser | undefined {
  const key = normalizeEmail(email);
  return users.find((u) => u.email === key && u.password === password);
}

export function registerMockUser(user: Omit<MockUser, 'email'> & { email: string }): void {
  const email = normalizeEmail(user.email);
  if (users.some((u) => u.email === email)) {
    throw new Error('EMAIL_EXISTS');
  }
  users = [...users, { ...user, email }];
}
