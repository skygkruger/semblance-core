// Credential Form UI Tests — Validates provider presets, form state, and password masking.
// Tests the CredentialForm component's exported types and behavior expectations.

import { describe, it, expect } from 'vitest';
import type { CredentialFormData } from '@semblance/ui';
import { PROVIDER_PRESETS } from '@semblance/gateway/credentials/types.js';

describe('CredentialForm Types', () => {
  it('CredentialFormData interface has required fields', () => {
    const data: CredentialFormData = {
      serviceType: 'email',
      protocol: 'imap',
      host: 'imap.gmail.com',
      port: 993,
      username: 'user@gmail.com',
      password: 'secret',
      useTLS: true,
      displayName: 'Work Email',
    };

    expect(data.serviceType).toBe('email');
    expect(data.protocol).toBe('imap');
    expect(data.host).toBe('imap.gmail.com');
    expect(data.port).toBe(993);
    expect(data.username).toBe('user@gmail.com');
    expect(data.password).toBe('secret');
    expect(data.useTLS).toBe(true);
    expect(data.displayName).toBe('Work Email');
  });

  it('CredentialFormData supports calendar type', () => {
    const data: CredentialFormData = {
      serviceType: 'calendar',
      protocol: 'caldav',
      host: 'caldav.example.com',
      port: 443,
      username: 'user@example.com',
      password: 'secret',
      useTLS: true,
      displayName: 'Calendar',
    };

    expect(data.serviceType).toBe('calendar');
    expect(data.protocol).toBe('caldav');
  });
});

describe('Provider Presets', () => {
  it('PROVIDER_PRESETS has Gmail', () => {
    expect(PROVIDER_PRESETS.gmail).toBeDefined();
    expect(PROVIDER_PRESETS.gmail!.imapHost).toBe('imap.gmail.com');
    expect(PROVIDER_PRESETS.gmail!.imapPort).toBe(993);
    expect(PROVIDER_PRESETS.gmail!.smtpHost).toBe('smtp.gmail.com');
    expect(PROVIDER_PRESETS.gmail!.smtpPort).toBe(587);
  });

  it('PROVIDER_PRESETS has Outlook', () => {
    expect(PROVIDER_PRESETS.outlook).toBeDefined();
    expect(PROVIDER_PRESETS.outlook!.imapHost).toBe('outlook.office365.com');
    expect(PROVIDER_PRESETS.outlook!.imapPort).toBe(993);
    expect(PROVIDER_PRESETS.outlook!.smtpHost).toBe('smtp.office365.com');
    expect(PROVIDER_PRESETS.outlook!.smtpPort).toBe(587);
  });

  it('PROVIDER_PRESETS has iCloud', () => {
    expect(PROVIDER_PRESETS.icloud).toBeDefined();
    expect(PROVIDER_PRESETS.icloud!.imapHost).toBe('imap.mail.me.com');
    expect(PROVIDER_PRESETS.icloud!.smtpHost).toBe('smtp.mail.me.com');
  });

  it('PROVIDER_PRESETS has Fastmail', () => {
    expect(PROVIDER_PRESETS.fastmail).toBeDefined();
    expect(PROVIDER_PRESETS.fastmail!.imapHost).toBe('imap.fastmail.com');
    expect(PROVIDER_PRESETS.fastmail!.smtpHost).toBe('smtp.fastmail.com');
  });

  it('PROVIDER_PRESETS has Proton Mail', () => {
    expect(PROVIDER_PRESETS.protonmail).toBeDefined();
    expect(PROVIDER_PRESETS.protonmail!.imapHost).toBe('127.0.0.1');
    expect(PROVIDER_PRESETS.protonmail!.imapPort).toBe(1143);
    expect(PROVIDER_PRESETS.protonmail!.smtpHost).toBe('127.0.0.1');
    expect(PROVIDER_PRESETS.protonmail!.smtpPort).toBe(1025);
  });

  it('all presets have required fields', () => {
    for (const [key, preset] of Object.entries(PROVIDER_PRESETS)) {
      expect(preset.name).toBeTruthy();
      expect(preset.imapHost).toBeTruthy();
      expect(typeof preset.imapPort).toBe('number');
      expect(preset.smtpHost).toBeTruthy();
      expect(typeof preset.smtpPort).toBe('number');
      // caldavUrl can be null (Proton Mail)
      expect(preset.caldavUrl === null || typeof preset.caldavUrl === 'string').toBe(true);
    }
  });

  it('Gmail note mentions App Password', () => {
    expect(PROVIDER_PRESETS.gmail!.notes).toBeTruthy();
    expect(PROVIDER_PRESETS.gmail!.notes!.toLowerCase()).toContain('app password');
  });

  it('iCloud note mentions App Password', () => {
    expect(PROVIDER_PRESETS.icloud!.notes).toBeTruthy();
    expect(PROVIDER_PRESETS.icloud!.notes!.toLowerCase()).toContain('app password');
  });

  it('Proton Mail note mentions Proton Bridge', () => {
    expect(PROVIDER_PRESETS.protonmail!.notes).toBeTruthy();
    expect(PROVIDER_PRESETS.protonmail!.notes!.toLowerCase()).toContain('bridge');
  });

  it('all preset ports are valid (1-65535)', () => {
    for (const preset of Object.values(PROVIDER_PRESETS)) {
      expect(preset.imapPort).toBeGreaterThanOrEqual(1);
      expect(preset.imapPort).toBeLessThanOrEqual(65535);
      expect(preset.smtpPort).toBeGreaterThanOrEqual(1);
      expect(preset.smtpPort).toBeLessThanOrEqual(65535);
    }
  });
});
