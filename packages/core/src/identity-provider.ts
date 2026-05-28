import type {
  AuditEntry,
  Customer,
  ProviderResult,
  User,
} from './types.js';

export interface IdentityProvider {
  listUsers(customer: Customer): Promise<ProviderResult<readonly User[]>>;
  getUser(customer: Customer, key: string): Promise<ProviderResult<User>>;
  suspendUser(customer: Customer, key: string): Promise<ProviderResult<User>>;
  resumeUser(customer: Customer, key: string): Promise<ProviderResult<User>>;
  readUserSnapshot(customer: Customer, key: string): Promise<ProviderResult<AuditEntry>>;
}

export type IdentityProviderMethod =
  | 'listUsers'
  | 'getUser'
  | 'suspendUser'
  | 'resumeUser'
  | 'readUserSnapshot';
