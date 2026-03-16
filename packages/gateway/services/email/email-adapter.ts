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
   * Try to refresh an expired Google OAuth token using the refresh_token.
   * Returns the new access token, or null if refresh fails.
   */
  private async refreshGoogleToken(): Promise<string | null> {
    if (!this.oauthTokenManager) return null;

    const refreshToken = await this.oauthTokenManager.getRefreshTokenAsync('google');
    if (!refreshToken) {
      console.error('[EmailAdapter] No refresh token available for Google');
      return null;
    }

    // We need the client ID and secret. These come from process.env since
    // the EmailAdapter doesn't have direct access to the OAuth config.
    const clientId = process.env['SEMBLANCE_GOOGLE_CLIENT_ID'];
    const clientSecret = process.env['SEMBLANCE_GOOGLE_CLIENT_SECRET'];
    if (!clientId) {
      console.error('[EmailAdapter] Cannot refresh: SEMBLANCE_GOOGLE_CLIENT_ID not set');
      return null;
    }

    try {
      console.error('[EmailAdapter] Attempting Google token refresh...');
      const resp = await globalThis.fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          ...(clientSecret ? { client_secret: clientSecret } : {}),
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => 'unknown');
        console.error(`[EmailAdapter] Token refresh failed (HTTP ${resp.status}): ${errText.slice(0, 300)}`);
        return null;
      }

      const data = await resp.json() as {
        access_token?: string;
        expires_in?: number;
        refresh_token?: string;
      };

      if (!data.access_token) {
        console.error('[EmailAdapter] Token refresh response missing access_token');
        return null;
      }

      // Store the refreshed tokens
      const newExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
      this.oauthTokenManager.refreshAccessToken(
        'google',
        data.access_token,
        newExpiresAt,
        data.refresh_token, // Google sometimes rotates refresh tokens
      );

      console.error('[EmailAdapter] Google token refreshed successfully, expires in', data.expires_in, 'seconds');
      return data.access_token;
    } catch (err) {
      console.error('[EmailAdapter] Token refresh error:', err);
      return null;
    }
  }

  /**
   * Try to get a Gmail OAuth access token. Returns null if not available.
   * Automatically refreshes expired tokens if a refresh_token is available.
   */
  private async getGmailOAuthToken(): Promise<{ accessToken: string; userEmail: string } | null> {
    if (!this.oauthTokenManager) {
      console.error('[EmailAdapter] No OAuthTokenManager — cannot use Gmail OAuth');
      return null;
    }

    let accessToken: string | null = null;

    // Check for valid (non-expired) tokens first
    if (this.oauthTokenManager.hasValidTokens('google')) {
      accessToken = await this.oauthTokenManager.getAccessTokenAsync('google');
      console.error('[EmailAdapter] Google OAuth token is valid, retrieved:', accessToken ? 'YES' : 'NO');
    } else {
      // Tokens exist but expired — try auto-refresh
      console.error('[EmailAdapter] Google OAuth token expired or missing, attempting refresh...');
      accessToken = await this.refreshGoogleToken();
    }

    if (!accessToken) {
      console.error('[EmailAdapter] No valid Google OAuth access token available');
      return null;
    }

    let userEmail = this.oauthTokenManager.getUserEmail('google');
    if (!userEmail) {
      // If we have no email on file, try Gmail's own profile endpoint first
      // (works with https://mail.google.com/ scope), then fall back to userinfo
      console.error('[EmailAdapter] No stored user email, fetching from Gmail profile...');
      try {
        // Gmail API profile endpoint — works with the mail.google.com scope
        const gmailResp = await globalThis.fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (gmailResp.ok) {
          const profile = await gmailResp.json() as { emailAddress?: string };
          if (profile.emailAddress) {
            userEmail = profile.emailAddress;
            console.error('[EmailAdapter] Got user email from Gmail profile:', userEmail);
          }
        } else {
          console.error(`[EmailAdapter] Gmail profile API returned ${gmailResp.status}`);
        }
      } catch (gmailErr) {
        console.error('[EmailAdapter] Gmail profile fetch failed:', gmailErr);
      }

      // Fallback: try Google userinfo (requires email/openid scope)
      if (!userEmail) {
        try {
          const resp = await globalThis.fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (resp.ok) {
            const info = await resp.json() as { email?: string };
            if (info.email) {
              userEmail = info.email;
              console.error('[EmailAdapter] Got user email from userinfo:', userEmail);
            }
          }
        } catch {
          // Can't determine email — fall through
        }
      }

      if (!userEmail) {
        console.error('[EmailAdapter] Could not determine Google user email from any source');
        return null;
      }

      // Cache the email in the token manager for future calls
      this.oauthTokenManager.storeTokens({
        provider: 'google',
        accessToken,
        refreshToken: (await this.oauthTokenManager.getRefreshTokenAsync('google')) ?? '',
        expiresAt: Date.now() + 3500 * 1000, // preserve ~current expiry
        scopes: '',
        userEmail,
      });
    }

    return { accessToken, userEmail };
  }

  private async handleFetch(params: EmailFetchParams): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    console.error('[EmailAdapter] handleFetch called with params:', JSON.stringify(params));

    // 1. Try traditional IMAP credentials first
    const imapCreds = this.credentialStore.getByType('email')
      .filter(c => c.protocol === 'imap');

    if (imapCreds.length > 0) {
      console.error('[EmailAdapter] Using traditional IMAP credentials');
      const messages = await this.imap.fetchMessages(imapCreds[0]!.id, params);
      return { success: true, data: { messages } };
    }

    // 2. Fall back to Gmail OAuth XOAUTH2
    console.error('[EmailAdapter] No IMAP credentials found, trying Gmail OAuth...');
    const oauth = await this.getGmailOAuthToken();
    if (oauth) {
      console.error(`[EmailAdapter] Using Gmail XOAUTH2 for ${oauth.userEmail}`);
      try {
        const messages = await this.imap.fetchMessagesOAuth(
          GMAIL_IMAP_HOST, GMAIL_IMAP_PORT,
          oauth.userEmail, oauth.accessToken,
          params,
        );
        console.error(`[EmailAdapter] Gmail XOAUTH2 fetch returned ${messages.length} messages`);
        return { success: true, data: { messages } };
      } catch (imapErr) {
        console.error('[EmailAdapter] Gmail IMAP XOAUTH2 connection failed:', imapErr);
        return {
          success: false,
          error: {
            code: 'IMAP_XOAUTH2_FAILED',
            message: `Gmail IMAP connection failed: ${imapErr instanceof Error ? imapErr.message : String(imapErr)}. Check that IMAP is enabled in Gmail Settings > Forwarding and POP/IMAP.`,
          },
        };
      }
    }

    console.error('[EmailAdapter] No email credentials or OAuth tokens available');
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

    // 2. Fall back to Gmail API send (more reliable than SMTP XOAUTH2)
    const oauth = await this.getGmailOAuthToken();
    if (oauth) {
      console.error(`[EmailAdapter] Sending email via Gmail API for ${oauth.userEmail}`);
      const toHeader = params.to.join(', ');
      const ccLine = params.cc && params.cc.length > 0 ? `Cc: ${params.cc.join(', ')}\r\n` : '';
      const replyHeaders = params.replyToMessageId
        ? `In-Reply-To: ${params.replyToMessageId}\r\nReferences: ${params.replyToMessageId}\r\n`
        : '';
      const rawMessage = [
        `From: ${oauth.userEmail}`,
        `To: ${toHeader}`,
        ...(ccLine ? [`Cc: ${params.cc!.join(', ')}`] : []),
        ...(replyHeaders ? [replyHeaders.trim()] : []),
        `Subject: ${params.subject}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        params.body,
      ].join('\r\n');

      const encoded = Buffer.from(rawMessage).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const resp = await globalThis.fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${oauth.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encoded }),
      });

      if (resp.ok) {
        const sent = await resp.json() as { id: string; threadId: string };
        console.error(`[EmailAdapter] Email sent via Gmail API: ${sent.id}`);
        return { success: true, data: { messageId: sent.id, threadId: sent.threadId } };
      }

      const errText = await resp.text().catch(() => 'unknown');
      console.error(`[EmailAdapter] Gmail API send failed (${resp.status}): ${errText.slice(0, 300)}`);
      // Fall back to SMTP XOAUTH2 if API fails
      try {
        console.error(`[EmailAdapter] Falling back to SMTP XOAUTH2 for ${oauth.userEmail}`);
        const result = await this.smtp.sendEmailOAuth(
          GMAIL_SMTP_HOST, GMAIL_SMTP_PORT,
          oauth.userEmail, oauth.accessToken,
          params,
        );
        return { success: true, data: result };
      } catch (smtpErr) {
        console.error(`[EmailAdapter] SMTP fallback also failed:`, smtpErr);
        return {
          success: false,
          error: { code: 'EMAIL_SEND_FAILED', message: `Gmail API: ${resp.status}. SMTP: ${smtpErr instanceof Error ? smtpErr.message : String(smtpErr)}` },
        };
      }
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

    // Fall back to Gmail API drafts via OAuth
    const oauth = await this.getGmailOAuthToken();
    if (oauth) {
      console.error(`[EmailAdapter] Creating Gmail draft via API for ${oauth.userEmail}`);
      // Build RFC 2822 message for Gmail API
      const toHeader = params.to.join(', ');
      const ccHeader = params.cc && params.cc.length > 0 ? `Cc: ${params.cc.join(', ')}\r\n` : '';
      const rawMessage = [
        `From: ${oauth.userEmail}`,
        `To: ${toHeader}`,
        ccHeader ? `Cc: ${params.cc!.join(', ')}` : '',
        `Subject: ${params.subject}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        params.body,
      ].filter(Boolean).join('\r\n');

      // Gmail API expects URL-safe base64
      const encoded = Buffer.from(rawMessage).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const resp = await globalThis.fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${oauth.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: { raw: encoded } }),
      });

      if (resp.ok) {
        const draft = await resp.json() as { id: string; message: { id: string } };
        console.error(`[EmailAdapter] Gmail draft created: ${draft.id}`);
        return { success: true, data: { saved: true, draftId: draft.id } };
      }

      const errText = await resp.text().catch(() => 'unknown');
      console.error(`[EmailAdapter] Gmail draft API failed (${resp.status}): ${errText.slice(0, 300)}`);
      return {
        success: false,
        error: { code: 'GMAIL_DRAFT_ERROR', message: `Gmail draft creation failed: ${resp.status}` },
      };
    }

    return {
      success: false,
      error: { code: 'NO_EMAIL_CREDENTIALS', message: 'No email credentials configured. Connect Gmail or add IMAP credentials in Settings.' },
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
