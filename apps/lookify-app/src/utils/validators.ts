// Validaciones de formulario (solo UX; el backend debe revalidar todo).

export type TipoDocumentoId = 'CC' | 'Pasaporte';

export const NOMBRE_MIN_CHARS = 3;
export const DOC_CC_MIN = 6;
export const DOC_CC_MAX = 10;
export const DOC_PASAPORTE_MIN = 6;
export const DOC_PASAPORTE_MAX = 12;
export const TELEFONO_LENGTH = 10;
export const TELEFONO_PREFIX = '3';
export const PASSWORD_MIN_LENGTH = 8;
export const EDAD_MINIMA = 18;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LETTER_REGEX = /\p{L}/u;
const DIGIT_REGEX = /\d/;

export function validarNombre(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'El nombre es obligatorio';
  const sinEspacios = trimmed.replace(/\s/g, '');
  if (sinEspacios.length < NOMBRE_MIN_CHARS) {
    return `Mínimo ${NOMBRE_MIN_CHARS} caracteres (sin contar espacios)`;
  }
  return null;
}

export function validarDocumento(tipo: TipoDocumentoId, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'El número de documento es obligatorio';
  if (tipo === 'CC') {
    if (!/^\d+$/.test(trimmed)) return 'La C.C. solo admite dígitos';
    if (trimmed.length < DOC_CC_MIN || trimmed.length > DOC_CC_MAX) {
      return `La C.C. debe tener entre ${DOC_CC_MIN} y ${DOC_CC_MAX} dígitos`;
    }
    return null;
  }
  if (!/^[a-zA-Z0-9]+$/.test(trimmed)) return 'El pasaporte es alfanumérico';
  if (trimmed.length < DOC_PASAPORTE_MIN || trimmed.length > DOC_PASAPORTE_MAX) {
    return `El pasaporte debe tener entre ${DOC_PASAPORTE_MIN} y ${DOC_PASAPORTE_MAX} caracteres`;
  }
  return null;
}

export function validarNacionalidad(value: string): string | null {
  if (!value.trim()) return 'La nacionalidad es obligatoria';
  return null;
}

function edadEnAnios(fecha: Date, hoy: Date): number {
  let edad = hoy.getFullYear() - fecha.getFullYear();
  const mesDiff = hoy.getMonth() - fecha.getMonth();
  if (mesDiff < 0 || (mesDiff === 0 && hoy.getDate() < fecha.getDate())) {
    edad -= 1;
  }
  return edad;
}

export function validarFechaNacimiento(fecha: Date | null): string | null {
  if (!fecha) return 'La fecha de nacimiento es obligatoria';
  const hoy = new Date();
  if (fecha > hoy) return 'La fecha no puede ser futura';
  if (edadEnAnios(fecha, hoy) < EDAD_MINIMA) {
    return `Debes tener al menos ${EDAD_MINIMA} años`;
  }
  return null;
}

export function validarTelefono(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'El teléfono es obligatorio';
  if (!/^\d+$/.test(trimmed)) return 'Solo dígitos, sin espacios';
  if (trimmed.length !== TELEFONO_LENGTH) return `Debe tener ${TELEFONO_LENGTH} dígitos`;
  if (!trimmed.startsWith(TELEFONO_PREFIX)) return 'Debe empezar por 3';
  return null;
}

export function validarCorreo(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'El correo es obligatorio';
  if (/\s/.test(trimmed)) return 'El correo no puede contener espacios';
  if (!EMAIL_REGEX.test(trimmed)) return 'Correo no válido';
  return null;
}

export function validarContrasenaRegistro(value: string): string | null {
  if (value.length === 0) return 'La contraseña es obligatoria';
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`;
  }
  if (!LETTER_REGEX.test(value)) return 'Incluye al menos una letra';
  if (!DIGIT_REGEX.test(value)) return 'Incluye al menos un número';
  return null;
}

export function validarConfirmarContrasena(contrasena: string, confirmacion: string): string | null {
  if (confirmacion.length === 0) return 'Confirma tu contraseña';
  if (contrasena !== confirmacion) return 'Las contraseñas no coinciden';
  return null;
}

export function validarContrasenaLogin(value: string): string | null {
  if (value.length === 0) return 'La contraseña es obligatoria';
  return null;
}

export interface RegistroClienteValues {
  nombre: string;
  tipoDocumento: TipoDocumentoId;
  numeroDocumento: string;
  nacionalidad: string;
  fechaNacimiento: Date | null;
  telefono: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export function registroClienteValido(values: RegistroClienteValues): boolean {
  return (
    validarNombre(values.nombre) === null &&
    validarDocumento(values.tipoDocumento, values.numeroDocumento) === null &&
    validarNacionalidad(values.nacionalidad) === null &&
    validarFechaNacimiento(values.fechaNacimiento) === null &&
    validarTelefono(values.telefono) === null &&
    validarCorreo(values.email) === null &&
    validarContrasenaRegistro(values.password) === null &&
    validarConfirmarContrasena(values.password, values.confirmPassword) === null
  );
}

export function loginValido(email: string, password: string): boolean {
  return validarCorreo(email) === null && validarContrasenaLogin(password) === null;
}
