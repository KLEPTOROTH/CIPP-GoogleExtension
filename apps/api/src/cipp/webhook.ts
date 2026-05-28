import { createHmac, timingSafeEqual } from 'node:crypto';

import type { CippWebhookEvent, ProcessResult } from './types.js';

export interface WebhookVerificationConfig {
  secret: string;
  replayWindowSeconds?: number;
  now?: () => Date;
}

export interface WebhookProcessInput {
  rawBody: string;
  signature: string;
  config: WebhookVerificationConfig;
}

export interface WebhookProcessResult extends ProcessResult {
  event?: CippWebhookEvent;
}

export function processWebhookEvent(input: WebhookProcessInput): WebhookProcessResult {
  const expected = buildSignature(input.rawBody, input.config.secret);
  const actual = normalizeSignature(input.signature);

  if (!safeEquals(actual, expected)) {
    return { accepted: false, reason: 'invalid_signature' };
  }

  let event: CippWebhookEvent;
  try {
    event = JSON.parse(input.rawBody) as CippWebhookEvent;
  } catch {
    return { accepted: false, reason: 'invalid_payload' };
  }

  if (!event.eventId || !event.customerId || !event.cippTenantId || !event.eventTime || !event.eventType) {
    return { accepted: false, reason: 'invalid_payload' };
  }

  if (
    event.eventType !== 'customer.created' &&
    event.eventType !== 'customer.updated' &&
    event.eventType !== 'customer.deleted'
  ) {
    return { accepted: false, reason: 'invalid_payload' };
  }

  if (event.sourceVersion !== undefined && (!Number.isFinite(event.sourceVersion) || event.sourceVersion < 0)) {
    return { accepted: false, reason: 'invalid_payload' };
  }

  const now = input.config.now?.() ?? new Date();
  const eventAt = new Date(event.eventTime);
  if (Number.isNaN(eventAt.getTime())) {
    return { accepted: false, reason: 'invalid_payload' };
  }
  const replayWindowSeconds = input.config.replayWindowSeconds ?? 300;
  if (Math.abs(now.getTime() - eventAt.getTime()) > replayWindowSeconds * 1000) {
    return { accepted: false, reason: 'stale' };
  }

  return { accepted: true, event };
}

export function buildSignature(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function normalizeSignature(value: string): string {
  return value.trim().replace(/^sha256=/, '');
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}
