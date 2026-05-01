import { describe, it, expect } from 'vitest';
import {
  UserRole,
  DepartmentDistributionMode,
  TagScope,
  QuickReplyScope,
  LeadStatusFinalKind,
  CustomFieldType,
  CustomFieldEntity,
  IntegrationOpenMode,
  IntegrationVisibility,
  TemplateCategory,
  TemplateStatus,
  TemplateHeaderType,
  ApiAuthType,
  WebhookAuthType,
  WebhookEvent,
  WebhookDeliveryStatus,
} from '@prisma/client';

/**
 * Sanity check de enums: pega remoção/renomeação acidental.
 * Se algum enum mudar intencionalmente, atualizar a lista esperada.
 */
describe('enum values', () => {
  it('UserRole tem 4 valores', () => {
    expect(Object.values(UserRole)).toEqual(['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'AGENT']);
  });

  it('DepartmentDistributionMode tem 4 valores', () => {
    expect(Object.values(DepartmentDistributionMode)).toEqual([
      'MANUAL',
      'RANDOM',
      'BALANCED',
      'SEQUENTIAL',
    ]);
  });

  it('TagScope tem 3 valores', () => {
    expect(Object.values(TagScope)).toEqual(['CONTACT', 'TICKET', 'BOTH']);
  });

  it('QuickReplyScope tem 2 valores', () => {
    expect(Object.values(QuickReplyScope)).toEqual(['COMPANY', 'PERSONAL']);
  });

  it('LeadStatusFinalKind tem 2 valores', () => {
    expect(Object.values(LeadStatusFinalKind)).toEqual(['WON', 'LOST']);
  });

  it('CustomFieldType tem 8 valores', () => {
    expect(Object.values(CustomFieldType)).toEqual([
      'TEXT',
      'NUMBER',
      'DATE',
      'BOOLEAN',
      'SELECT',
      'EMAIL',
      'PHONE',
      'URL',
    ]);
  });

  it('CustomFieldEntity tem 3 valores', () => {
    expect(Object.values(CustomFieldEntity)).toEqual(['CONTACT', 'TICKET', 'BOTH']);
  });

  it('IntegrationOpenMode tem 2 valores', () => {
    expect(Object.values(IntegrationOpenMode)).toEqual(['NEW_TAB', 'IFRAME']);
  });

  it('IntegrationVisibility tem 2 valores', () => {
    expect(Object.values(IntegrationVisibility)).toEqual(['ALL_USERS', 'ADMINS_ONLY']);
  });

  it('TemplateCategory tem 3 valores', () => {
    expect(Object.values(TemplateCategory)).toEqual(['MARKETING', 'UTILITY', 'AUTHENTICATION']);
  });

  it('TemplateStatus tem 5 valores', () => {
    expect(Object.values(TemplateStatus)).toEqual([
      'PENDING',
      'APPROVED',
      'REJECTED',
      'DISABLED',
      'PAUSED',
    ]);
  });

  it('TemplateHeaderType tem 4 valores', () => {
    expect(Object.values(TemplateHeaderType)).toEqual(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']);
  });

  it('ApiAuthType tem 5 valores', () => {
    expect(Object.values(ApiAuthType)).toEqual([
      'NONE',
      'BEARER_TOKEN',
      'API_KEY_HEADER',
      'BASIC_AUTH',
      'CUSTOM_HEADERS',
    ]);
  });

  it('WebhookAuthType tem 4 valores', () => {
    expect(Object.values(WebhookAuthType)).toEqual([
      'NONE',
      'BEARER_TOKEN',
      'HMAC_SHA256',
      'BASIC_AUTH',
    ]);
  });

  it('WebhookEvent tem 11 valores', () => {
    expect(Object.values(WebhookEvent)).toEqual([
      'CONTACT_CREATED',
      'CONTACT_UPDATED',
      'TICKET_CREATED',
      'TICKET_ASSIGNED',
      'TICKET_UPDATED',
      'TICKET_TRANSFERRED',
      'TICKET_CLOSED',
      'TICKET_ARCHIVED',
      'MESSAGE_CREATED',
      'MESSAGE_STATUS_CHANGED',
      'CHANNEL_STATUS_CHANGED',
    ]);
  });

  it('WebhookDeliveryStatus tem 5 valores', () => {
    expect(Object.values(WebhookDeliveryStatus)).toEqual([
      'PENDING',
      'SUCCESS',
      'RETRYING',
      'FAILED',
      'CANCELLED',
    ]);
  });
});
