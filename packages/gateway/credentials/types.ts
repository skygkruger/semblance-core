// Credential Types — Shared definitions for service credential management.
// CRITICAL: Passwords are encrypted at rest. Never store plaintext passwords.

import { z } from 'zod';

export const ServiceType = z.enum(['email', 'calendar']);
export type ServiceType = z.infer<typeof ServiceType>;

export const ProtocolType = z.enum(['imap', 'smtp', 'caldav']);
export type ProtocolType = z.infer<typeof ProtocolType>;

export const ServiceCredential = z.object({
  id: z.string(),
  serviceType: ServiceType,
  protocol: ProtocolType,
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1),
  encryptedPassword: z.string(),  // AES-256-GCM encrypted, never plaintext
  useTLS: z.boolean(),
  displayName: z.string().min(1),
  createdAt: z.string().datetime(),
  lastVerifiedAt: z.string().datetime().nullable(),
});
export type ServiceCredential = z.infer<typeof ServiceCredential>;

export const ServiceCredentialInput = ServiceCredential.omit({
  id: true,
  createdAt: true,
  lastVerifiedAt: true,
  encryptedPassword: true,
}).extend({
  password: z.string().min(1),  // Plaintext password — will be encrypted before storage
});
export type ServiceCredentialInput = z.infer<typeof ServiceCredentialInput>;

export const ConnectionTestResult = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});
export type ConnectionTestResult = z.infer<typeof ConnectionTestResult>;

/**
 * Provider presets for common email/calendar services.
 * Pre-fills host, port, TLS settings for known providers.
 */
export interface ProviderPreset {
  name: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  caldavUrl: string | null;
  notes: string | null;
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  gmail: {
    name: 'Gmail',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    caldavUrl: 'https://www.googleapis.com/caldav/v2/',
    notes: 'Requires App Password (not your regular password)',
  },
  outlook: {
    name: 'Outlook',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    caldavUrl: 'https://outlook.office365.com/caldav/',
    notes: null,
  },
  icloud: {
    name: 'iCloud',
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    caldavUrl: 'https://caldav.icloud.com/',
    notes: 'Requires App Password',
  },
  fastmail: {
    name: 'Fastmail',
    imapHost: 'imap.fastmail.com',
    imapPort: 993,
    smtpHost: 'smtp.fastmail.com',
    smtpPort: 587,
    caldavUrl: 'https://caldav.fastmail.com/dav/',
    notes: 'App Password recommended',
  },
  protonmail: {
    name: 'Proton Mail',
    imapHost: '127.0.0.1',
    imapPort: 1143,
    smtpHost: '127.0.0.1',
    smtpPort: 1025,
    caldavUrl: null,
    notes: 'Requires Proton Bridge running locally',
  },
};
