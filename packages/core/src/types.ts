export interface Customer {
  id: string;
  name: string;
}

export interface M365Binding {
  kind: 'm365';
  tenantId: string;
  userId: string;
  upn: string;
}

export interface GoogleBinding {
  kind: 'google';
  customerId: string;
  userId: string;
  email: string;
}

export interface User {
  id: string;
  customerId: string;
  email: string;
  displayName: string;
  suspended: boolean;
  createdAt: string;
  updatedAt: string;
  m365?: M365Binding;
  google?: GoogleBinding;
}

export interface AuditEntry {
  customerId: string;
  key: string;
  action: 'suspend' | 'resume' | 'read';
  before: User;
  after: User;
  timestamp: string;
}

export interface ProviderResultSuccess<T> {
  ok: true;
  value: T;
}

export interface ProviderResultFailure {
  ok: false;
  error: ProviderError;
}

export type ProviderErrorCode =
  | 'generic'
  | 'quota_exceeded'
  | 'expired_refresh_token'
  | 'network_timeout'
  | 'not_found';

export type ProviderResult<T> = ProviderResultSuccess<T> | ProviderResultFailure;

export interface ProviderErrorInit {
  code: ProviderErrorCode;
  message?: string;
  statusCode?: number;
  retryable?: boolean;
  cause?: unknown;
}

export class ProviderError extends Error {
  public readonly code: ProviderErrorCode;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public override cause?: unknown;

  constructor({ code, message, statusCode, retryable = false, cause }: ProviderErrorInit) {
    super(message ?? code);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode ?? 500;
    this.retryable = retryable;
    this.cause = cause;
  }
}

export class GenericProviderError extends ProviderError {
  constructor(message = 'provider_error') {
    super({ code: 'generic', message, statusCode: 500, retryable: false });
  }
}

export class QuotaExceededError extends ProviderError {
  constructor(message = 'quota_exceeded') {
    super({ code: 'quota_exceeded', message, statusCode: 429, retryable: true });
  }
}

export class ExpiredRefreshTokenError extends ProviderError {
  constructor(message = 'expired_refresh_token') {
    super({ code: 'expired_refresh_token', message, statusCode: 401, retryable: false });
  }
}

export class NetworkTimeoutError extends ProviderError {
  constructor(message = 'network_timeout') {
    super({ code: 'network_timeout', message, statusCode: 504, retryable: true });
  }
}

export class NotFoundError extends ProviderError {
  constructor(message = 'not_found') {
    super({ code: 'not_found', message, statusCode: 404, retryable: false });
  }
}

export type ProviderErrorFactory = new (message?: string) => ProviderError;
