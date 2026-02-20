// Email Adapter — Unified service adapter for email operations.
// Routes email.fetch to IMAP, email.send to SMTP, email.draft to IMAP (APPEND).

import type { ActionType } from '@semblance/core';
import type { ServiceAdapter } from '../types.js';
import type { CredentialStore } from '../../credentials/store.js';
import { IMAPAdapter } from './imap-adapter.js';
import { SMTPAdapter } from './smtp-adapter.js';
import type { EmailFetchParams, EmailSendParams } from './types.js';

export class EmailAdapter implements ServiceAdapter {
  readonly imap: IMAPAdapter;
  readonly smtp: SMTPAdapter;
  private credentialStore: CredentialStore;

  constructor(credentialStore: CredentialStore) {
    this.credentialStore = credentialStore;
    this.imap = new IMAPAdapter(credentialStore);
    this.smtp = new SMTPAdapter(credentialStore);
  }

  async execute(action: ActionType, payload: unknown): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    try {
      switch (action) {
        case 'email.fetch':
          return await this.handleFetch(payload as EmailFetchParams);
        case 'email.send':
          return await this.handleSend(payload as EmailSendParams);
        case 'email.draft':
          return await this.handleDraft(payload as EmailSendParams);
        default:
          return {
            success: false,
            error: { code: 'UNSUPPORTED_ACTION', message: `Email adapter does not support: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'EMAIL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  private async handleFetch(params: EmailFetchParams): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    // Find IMAP credentials
    const imapCreds = this.credentialStore.getByType('email')
      .filter(c => c.protocol === 'imap');

    if (imapCreds.length === 0) {
      return {
        success: false,
        error: { code: 'NO_IMAP_CREDENTIALS', message: 'No IMAP credentials configured' },
      };
    }

    // Use the first IMAP credential (multi-account selection is Step 6)
    const messages = await this.imap.fetchMessages(imapCreds[0]!.id, params);
    return { success: true, data: { messages } };
  }

  private async handleSend(params: EmailSendParams): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    // Find SMTP credentials
    const smtpCreds = this.credentialStore.getByType('email')
      .filter(c => c.protocol === 'smtp');

    if (smtpCreds.length === 0) {
      return {
        success: false,
        error: { code: 'NO_SMTP_CREDENTIALS', message: 'No SMTP credentials configured' },
      };
    }

    const result = await this.smtp.sendEmail(smtpCreds[0]!.id, params);
    return { success: true, data: result };
  }

  private async handleDraft(params: EmailSendParams): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    // Drafts are saved to the IMAP Drafts folder
    const imapCreds = this.credentialStore.getByType('email')
      .filter(c => c.protocol === 'imap');

    if (imapCreds.length === 0) {
      return {
        success: false,
        error: { code: 'NO_IMAP_CREDENTIALS', message: 'No IMAP credentials configured' },
      };
    }

    await this.imap.saveDraft(imapCreds[0]!.id, params);
    return { success: true, data: { saved: true } };
  }

  async shutdown(): Promise<void> {
    await this.imap.shutdown();
    await this.smtp.shutdown();
  }
}
