/**
 * SlackAdapter — Gateway service adapter for the Slack Web API.
 *
 * Extends BaseOAuthAdapter (standard OAuth 2.0) with Slack-specific token handling.
 *
 * IMPORTANT: Slack's token exchange returns { ok, access_token, team, authed_user, ... }
 * which differs from standard OAuth. The base class handles the standard fields,
 * but we override performAuthFlow to handle Slack's response format.
 *
 * Registry ID: 'slack-oauth' (distinct from 'slack-export' which handles archive imports).
 *
 * All HTTP calls use globalThis.fetch. No external HTTP libraries.
 */

import type { ActionType } from '@semblance/core';
import type { OAuthTokenManager } from '../oauth-token-manager.js';
import type { OAuthConfig } from '../oauth-config.js';
import type { AdapterResult } from '../base-oauth-adapter.js';
import type { ImportedItem } from '@semblance/core/importers/types.js';
import { BaseOAuthAdapter } from '../base-oauth-adapter.js';
import { OAuthCallbackServer } from '../oauth-callback-server.js';
import { oauthClients } from '../../config/oauth-clients.js';

const API_BASE = 'https://slack.com/api';

/** Build the OAuthConfig for Slack. */
export function getSlackOAuthConfig(): OAuthConfig {
  return {
    providerKey: 'slack-oauth',
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: 'channels:history,channels:read,users:read,users:read.email',
    usePKCE: false,
    clientId: oauthClients.slack.clientId,
    clientSecret: oauthClients.slack.clientSecret,
  };
}

interface SlackTokenResponse {
  ok: boolean;
  access_token: string;
  token_type: string;
  scope: string;
  bot_user_id?: string;
  app_id: string;
  team: { id: string; name: string };
  authed_user: { id: string; scope: string; access_token: string; token_type: string };
  enterprise?: { id: string; name: string } | null;
  error?: string;
}

interface SlackAuthTestResponse {
  ok: boolean;
  url: string;
  team: string;
  user: string;
  team_id: string;
  user_id: string;
  bot_id?: string;
  error?: string;
}

interface SlackConversation {
  id: string;
  name: string;
  is_channel: boolean;
  is_im: boolean;
  is_mpim: boolean;
  is_private: boolean;
  is_archived: boolean;
  is_member: boolean;
  topic?: { value: string };
  purpose?: { value: string };
  num_members?: number;
  updated?: number;
}

interface SlackConversationsListResponse {
  ok: boolean;
  channels: SlackConversation[];
  response_metadata?: { next_cursor: string };
  error?: string;
}

interface SlackMessage {
  type: string;
  user?: string;
  text: string;
  ts: string;
  thread_ts?: string;
  reply_count?: number;
  subtype?: string;
  attachments?: Array<{ text?: string; title?: string }>;
}

interface SlackConversationsHistoryResponse {
  ok: boolean;
  messages: SlackMessage[];
  has_more: boolean;
  response_metadata?: { next_cursor: string };
  error?: string;
}

export class SlackAdapter extends BaseOAuthAdapter {
  constructor(tokenManager: OAuthTokenManager) {
    super(tokenManager, getSlackOAuthConfig());
  }

  /**
   * Override auth flow to handle Slack's non-standard token response.
   * Slack returns { ok, access_token, team, authed_user, ... } instead of standard OAuth.
   * We use the authed_user.access_token for user-scoped operations.
   */
  async performAuthFlow(): Promise<AdapterResult> {
    const callbackServer = new OAuthCallbackServer();
    const { callbackUrl, state } = await callbackServer.start();

    const authUrl = new URL(this.config.authUrl);
    authUrl.searchParams.set('client_id', this.config.clientId);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('scope', ''); // Bot scopes go here if needed
    authUrl.searchParams.set('user_scope', this.config.scopes); // User scopes
    authUrl.searchParams.set('state', state);

    try {
      const { code } = await callbackServer.waitForCallback();

      const tokenResponse = await globalThis.fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret ?? '',
          redirect_uri: callbackUrl,
        }),
      });

      const tokenData = await tokenResponse.json() as SlackTokenResponse;

      if (!tokenData.ok || !tokenData.authed_user?.access_token) {
        return {
          success: false,
          error: {
            code: 'TOKEN_ERROR',
            message: tokenData.error ?? 'Slack token exchange failed',
          },
        };
      }

      // Use the user-scoped token for reading messages
      const userToken = tokenData.authed_user.access_token;

      // Get user info
      const userInfo = await this.getUserInfo(userToken);

      this.tokenManager.storeTokens({
        provider: this.config.providerKey,
        accessToken: userToken,
        refreshToken: '', // Slack tokens don't refresh (they're long-lived)
        expiresAt: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
        scopes: tokenData.authed_user.scope,
        userEmail: userInfo.email ?? userInfo.displayName,
      });

      return {
        success: true,
        data: {
          provider: this.config.providerKey,
          teamName: tokenData.team.name,
          teamId: tokenData.team.id,
          userId: tokenData.authed_user.id,
          displayName: userInfo.displayName,
        },
      };
    } catch (err) {
      callbackServer.stop();
      return {
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  protected async getUserInfo(accessToken: string): Promise<{ email?: string; displayName?: string }> {
    // Step 1: Call auth.test to get the authenticated user's ID
    const authResponse = await globalThis.fetch(`${API_BASE}/auth.test`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!authResponse.ok) {
      throw new Error(`Slack auth.test failed: HTTP ${authResponse.status}`);
    }

    const authData = await authResponse.json() as SlackAuthTestResponse;

    if (!authData.ok) {
      throw new Error(`Slack auth.test error: ${authData.error}`);
    }

    // Step 2: Call users.info with the user_id to get email and real_name
    const userResponse = await globalThis.fetch(`${API_BASE}/users.info?user=${authData.user_id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userResponse.ok) {
      throw new Error(`Slack users.info failed: HTTP ${userResponse.status}`);
    }

    const userData = await userResponse.json() as {
      ok: boolean;
      user?: { profile: { email?: string; real_name?: string }; real_name?: string; name: string };
      error?: string;
    };

    if (!userData.ok || !userData.user) {
      // Fall back to auth.test data if users.info fails
      return { displayName: authData.user };
    }

    return {
      email: userData.user.profile.email,
      displayName: userData.user.profile.real_name ?? userData.user.real_name ?? userData.user.name,
    };
  }

  async execute(action: ActionType, payload: unknown): Promise<AdapterResult> {
    const p = payload as Record<string, unknown>;

    try {
      switch (action) {
        case 'connector.auth':
          return await this.performAuthFlow();

        case 'connector.auth_status':
          return this.handleAuthStatus();

        case 'connector.disconnect':
          return await this.performDisconnect();

        case 'connector.sync':
          return await this.handleSync(p);

        case 'connector.list_items':
          return await this.handleListItems(p);

        default:
          return {
            success: false,
            error: { code: 'UNKNOWN_ACTION', message: `SlackAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'SLACK_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Sync channels and messages from Slack.
   * Fetches conversations.list, then conversations.history for each channel.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const limit = (payload['limit'] as number) ?? 200;
    const maxChannels = (payload['maxChannels'] as number) ?? 10;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    // 1. Fetch channel list
    let channels: SlackConversation[] = [];
    try {
      channels = await this.fetchConversations(accessToken, maxChannels);
    } catch (err) {
      errors.push({ message: `Conversations: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 2. Fetch recent messages from each channel
    const messagesPerChannel = Math.max(1, Math.floor(limit / Math.max(channels.length, 1)));

    for (const channel of channels) {
      if (items.length >= limit) break;

      try {
        const messageItems = await this.fetchChannelHistory(
          accessToken,
          channel,
          Math.min(messagesPerChannel, limit - items.length),
        );
        items.push(...messageItems);
      } catch (err) {
        errors.push({ message: `Channel ${channel.name}: ${err instanceof Error ? err.message : String(err)}` });
      }
    }

    return {
      success: true,
      data: {
        items,
        totalItems: items.length,
        channelsScanned: channels.length,
        errors,
      },
    };
  }

  /**
   * List channels/conversations with cursor-based pagination.
   */
  private async handleListItems(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const pageSize = (payload['pageSize'] as number) ?? 20;
    const cursor = payload['pageToken'] as string | undefined;

    const url = new URL(`${API_BASE}/conversations.list`);
    url.searchParams.set('types', 'public_channel,private_channel,im');
    url.searchParams.set('limit', String(Math.min(pageSize, 1000)));
    url.searchParams.set('exclude_archived', 'true');
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'SLACK_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const data = await response.json() as SlackConversationsListResponse;

    if (!data.ok) {
      return {
        success: false,
        error: { code: 'SLACK_API_ERROR', message: data.error ?? 'Unknown Slack API error' },
      };
    }

    const items = data.channels.map((channel) => this.channelToImportedItem(channel));
    const nextCursor = data.response_metadata?.next_cursor || null;

    return {
      success: true,
      data: {
        items,
        nextPageToken: nextCursor && nextCursor.length > 0 ? nextCursor : null,
      },
    };
  }

  private async fetchConversations(accessToken: string, limit: number): Promise<SlackConversation[]> {
    const channels: SlackConversation[] = [];
    let cursor: string | undefined;

    while (channels.length < limit) {
      const url = new URL(`${API_BASE}/conversations.list`);
      url.searchParams.set('types', 'public_channel,private_channel,im');
      url.searchParams.set('limit', String(Math.min(200, limit - channels.length)));
      url.searchParams.set('exclude_archived', 'true');
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      }

      const response = await globalThis.fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as SlackConversationsListResponse;

      if (!data.ok) {
        throw new Error(`Slack API error: ${data.error}`);
      }

      // Only include channels the user is a member of
      const memberChannels = data.channels.filter(c => c.is_member || c.is_im);
      channels.push(...memberChannels);

      const nextCursor = data.response_metadata?.next_cursor;
      if (!nextCursor || nextCursor.length === 0) break;
      cursor = nextCursor;
    }

    return channels.slice(0, limit);
  }

  private async fetchChannelHistory(
    accessToken: string,
    channel: SlackConversation,
    limit: number,
  ): Promise<ImportedItem[]> {
    const url = new URL(`${API_BASE}/conversations.history`);
    url.searchParams.set('channel', channel.id);
    url.searchParams.set('limit', String(Math.min(limit, 200)));

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as SlackConversationsHistoryResponse;

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return data.messages
      .filter(msg => msg.type === 'message' && !msg.subtype) // Only regular user messages
      .map((msg) => this.messageToImportedItem(msg, channel));
  }

  private messageToImportedItem(message: SlackMessage, channel: SlackConversation): ImportedItem {
    const channelName = channel.name || (channel.is_im ? 'DM' : 'unknown');
    const tsMs = parseFloat(message.ts) * 1000;

    return {
      id: `slk_live_${channel.id}_${message.ts.replace('.', '')}`,
      sourceType: 'messaging' as const,
      title: `${channelName}: ${message.text.slice(0, 80)}${message.text.length > 80 ? '...' : ''}`,
      content: message.text,
      timestamp: new Date(tsMs).toISOString(),
      metadata: {
        provider: 'slack-oauth',
        type: 'message',
        channelId: channel.id,
        channelName,
        userId: message.user,
        threadTs: message.thread_ts,
        replyCount: message.reply_count,
        isThread: !!message.thread_ts && message.thread_ts !== message.ts,
        hasAttachments: (message.attachments?.length ?? 0) > 0,
      },
    };
  }

  private channelToImportedItem(channel: SlackConversation): ImportedItem {
    const channelType = channel.is_im ? 'DM' : channel.is_mpim ? 'Group DM' : channel.is_private ? 'Private Channel' : 'Channel';

    return {
      id: `slk_live_channel_${channel.id}`,
      sourceType: 'messaging' as const,
      title: `${channelType}: ${channel.name || 'Direct Message'}`,
      content: `Slack ${channelType.toLowerCase()}: "${channel.name || 'DM'}"${channel.topic?.value ? `. Topic: ${channel.topic.value}` : ''}${channel.purpose?.value ? `. Purpose: ${channel.purpose.value}` : ''}. ${channel.num_members ?? 0} members.`,
      timestamp: channel.updated ? new Date(channel.updated * 1000).toISOString() : new Date().toISOString(),
      metadata: {
        provider: 'slack-oauth',
        type: 'channel',
        channelId: channel.id,
        channelName: channel.name,
        channelType,
        isPrivate: channel.is_private,
        isArchived: channel.is_archived,
        numMembers: channel.num_members,
      },
    };
  }
}
