// Email Adapter — Unified service adapter for email operations.
// Routes email.fetch to IMAP, email.send to SMTP, email.draft to IMAP (APPEND).
// Supports both traditional IMAP/SMTP credentials AND Gmail OAuth2 XOAUTH2.

import type { ActionType, EmailArchivePayload, EmailMovePayload, EmailMarkReadPayload } from '@semblance/core';
import type { ServiceAdapter } from '../types.js';
import type { CredentialStore } from '../../credentials/store.js';
import type { OAuthTokenManager } from '../oauth-token-manager.js';
import { IMAPAdapter } from './imap-adapter.js';
import { SMTPAdapter } from './smtp-adapter.js';
import type { EmailFetchParams, EmailSendParams } from './types.js';

// Gmail IMAP/SMTP settings for XOAUTH2
const GMAIL_IMAP_HOST = 'imap.gmail.com';
const GMAIL_IMAP_PORT = 993;
const GMAIL_SMTP_HOST = 'smtp.gmail.com';
const GMAIL_SMTP_PORT = 465;

export class EmailAdapter implements ServiceAdapter {
  readonly imap: IMAPAdapter;
  readonly smtp: SMTPAdapter;
  private credentialStore: CredentialStore;
  private oauthTokenManager: OAuthTokenManager | null;

  constructor(credentialStore: CredentialStore, oauthTokenManager?: OAuthTokenManager) {
    this.credentialStore = credentialStore;
    this.oauthTokenManager = oauthTokenManager ?? null;
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
        case 'email.archive':
          return await this.handleArchive(payload as EmailArchivePayload);
        case 'email.move':
          return await this.handleMove(payload as EmailMovePayload);
        case 'email.markRead':
          return await this.handleMarkRead(payload as EmailMarkReadPayload);
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

  /**
   * Try to get a Gmail OAuth access token. Returns null if not available.
   */
  private async getGmailOAuthToken(): Promise<{ accessToken: string; userEmail: string } | null> {
    if (!this.oauthTokenManager) return null;

    // Check for a Google OAuth token (stored with provider key 'google')
    if (!this.oauthTokenManager.hasValidTokens('google')) return null;

    const accessToken = await this.oauthTokenManager.getAccessTokenAsync('google');
    if (!accessToken) return null;

    const userEmail = this.oauthTokenManager.getUserEmail('google');
    if (!userEmail) {
      // If we have no email on file, try to fetch it from Google's userinfo API
      try {
        const resp = await globalThis.fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (resp.ok) {
          const info = await resp.json() as { email?: string };
          if (info.email) return { accessToken, userEmail: info.email };
        }
      } catch {
        // Can't determine email — fall through
      }
      return null;
    }

    return { accessToken, userEmail };
  }

  private async handleFetch(params: EmailFetchParams): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    // 1. Try traditional IMAP credentials first
    const imapCreds = this.credentialStore.getByType('email')
      .filter(c => c.protocol === 'imap');

    if (imapCreds.length > 0) {
      const messages = await this.imap.fetchMessages(imapCreds[0]!.id, params);
      return { success: true, data: { messages } };
    }

    // 2. Fall back to Gmail OAuth XOAUTH2
    const oauth = await this.getGmailOAuthToken();
    if (oauth) {
      console.error(`[EmailAdapter] Using Gmail XOAUTH2 for ${oauth.userEmail}`);
      const messages = await this.imap.fetchMessagesOAuth(
        GMAIL_IMAP_HOST, GMAIL_IMAP_PORT,
        oauth.userEmail, oauth.accessToken,
        params,
      );
      return { success: true, data: { messages } };
    }

    return {
      success: false,
      error: { code: 'NO_EMAIL_CREDENTIALS', message: 'No email credentials configured. Connect Gmail or add IMAP credentials in Settings.' },
    };
  }

  private async handleSend(params: EmailSendParams): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    // 1. Try traditional SMTP credentials first
    const smtpCreds = this.credentialStore.getByType('email')
      .filter(c => c.protocol === 'smtp');

    if (smtpCreds.length > 0) {
      const result = await this.smtp.sendEmail(smtpCreds[0]!.id, params);
      return { success: true, data: result };
    }

    // 2. Fall back to Gmail OAuth XOAUTH2 via SMTP
    const oauth = await this.getGmailOAuthToken();
    if (oauth) {
      console.error(`[EmailAdapter] Using Gmail SMTP XOAUTH2 for ${oauth.userEmail}`);
      const result = await this.smtp.sendEmailOAuth(
        GMAIL_SMTP_HOST, GMAIL_SMTP_PORT,
        oauth.userEmail, oauth.accessToken,
        params,
      );
      return { success: true, data: result };
    }

    return {
      success: false,
      error: { code: 'NO_EMAIL_CREDENTIALS', message: 'No email credentials configured. Connect Gmail or add SMTP credentials in Settings.' },
    };
  }

  private async handleDraft(params: EmailSendParams): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    const imapCreds = this.credentialStore.getByType('email')
      .filter(c => c.protocol === 'imap');

    if (imapCreds.length > 0) {
      await this.imap.saveDraft(imapCreds[0]!.id, params);
      return { success: true, data: { saved: true } };
    }

    // OAuth fallback for drafts not implemented yet — Gmail API would be needed
    return {
      success: false,
      error: { code: 'NO_IMAP_CREDENTIALS', message: 'Draft saving requires IMAP credentials (Gmail OAuth draft support coming soon)' },
    };
  }

  private async handleArchive(params: EmailArchivePayload): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    const imapCreds = this.credentialStore.getByType('email')
      .filter(c => c.protocol === 'imap');

    if (imapCreds.length === 0) {
      return { success: false, error: { code: 'NO_IMAP_CREDENTIALS', message: 'No IMAP credentials configured' } };
    }

    const credId = params.accountId ?? imapCreds[0]!.id;
    await this.imap.archiveMessages(credId, params.messageIds, params.targetFolder);
    return { success: true, data: { archived: params.messageIds.length } };
  }

  private async handleMove(params: EmailMovePayload): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    const imapCreds = this.credentialStore.getByType('email')
      .filter(c => c.protocol === 'imap');

    if (imapCreds.length === 0) {
      return { success: false, error: { code: 'NO_IMAP_CREDENTIALS', message: 'No IMAP credentials configured' } };
    }

    const credId = params.accountId ?? imapCreds[0]!.id;
    await this.imap.moveMessages(credId, params.messageIds, params.fromFolder, params.toFolder);
    return { success: true, data: { moved: params.messageIds.length } };
  }

  private async handleMarkRead(params: EmailMarkReadPayload): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    const imapCreds = this.credentialStore.getByType('email')
      .filter(c => c.protocol === 'imap');

    if (imapCreds.length === 0) {
      return { success: false, error: { code: 'NO_IMAP_CREDENTIALS', message: 'No IMAP credentials configured' } };
    }

    const credId = params.accountId ?? imapCreds[0]!.id;
    await this.imap.markAsRead(credId, params.messageIds, params.read);
    return { success: true, data: { updated: params.messageIds.length } };
  }

  async shutdown(): Promise<void> {
    await this.imap.shutdown();
    await this.smtp.shutdown();
  }
}
