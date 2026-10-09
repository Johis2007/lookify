export type ServiceErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_DUPLICATE'
  | 'DOCUMENTO_DUPLICADO'
  | 'VALIDATION'
  | 'NETWORK'
  | 'UNKNOWN';

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;

  constructor(code: ServiceErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ServiceError';
    this.code = code;
  }
}
