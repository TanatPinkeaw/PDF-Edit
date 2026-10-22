/** Small HTTP helpers shared by the route modules. */

export type ApiErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'sign_in_required'
  | 'forbidden_origin'
  | 'not_found'
  | 'email_taken'
  | 'invalid_credentials'
  | 'too_many_attempts'
  | 'insufficient_credits'
  | 'code_not_found'
  | 'code_unavailable'
  | 'code_missing'
  | 'code_invalid'
  | 'code_expired'
  | 'email_unverified'
  | 'already_verified'
  | 'no_password'
  | 'mail_not_configured'
  | 'mail_failed'
  | 'quota_exceeded'
  | 'auth_not_configured'
  | 'stream_too_large'
  | 'gone'
  | 'internal'
  | 'empty_file'
  | 'file_too_large'
  | 'unsupported_type'
  | 'converter_missing'
  | 'conversion_failed'
  | 'timeout';

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: Record<string, unknown>): ApiError {
  return new ApiError(400, 'invalid_request', message, details);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns the request body as a plain object, rejecting arrays and scalars. */
export function readObjectBody(body: unknown): Record<string, unknown> {
  if (!isPlainObject(body)) throw badRequest('ต้องส่ง JSON object เป็น body');
  return body;
}

export function readString(
  source: Record<string, unknown>,
  key: string,
  options: { required?: boolean; maxLength?: number; pattern?: RegExp } = {},
): string | null {
  const raw = source[key];
  if (raw === undefined || raw === null || raw === '') {
    if (options.required) throw badRequest(`ต้องระบุ ${key}`);
    return null;
  }
  if (typeof raw !== 'string') throw badRequest(`${key} ต้องเป็นข้อความ`);
  const value = raw.trim();
  if (options.maxLength !== undefined && value.length > options.maxLength) {
    throw badRequest(`${key} ยาวเกิน ${options.maxLength} ตัวอักษร`);
  }
  if (options.pattern && !options.pattern.test(value)) {
    throw badRequest(`${key} มีรูปแบบไม่ถูกต้อง`);
  }
  return value;
}

export function readIntInRange(
  source: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): number | null {
  const raw = source[key];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw badRequest(`${key} ต้องเป็นตัวเลข`);
  const value = Math.round(raw);
  if (value < min || value > max) throw badRequest(`${key} ต้องอยู่ระหว่าง ${min}–${max}`);
  return value;
}
