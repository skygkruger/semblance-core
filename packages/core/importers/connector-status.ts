/**
 * Connector Status Types — Shared type definitions for connector state tracking.
 *
 * Used by both Core-side ConnectorRegistry and Gateway-side adapters
 * to communicate connector health and connection status.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

export type ConnectorStatus = 'connected' | 'disconnected' | 'error' | 'pending';

export type ConnectorCategory =
  | 'cloud_storage'
  | 'productivity'
  | 'developer'
  | 'reading_research'
  | 'health_fitness'
  | 'social'
  | 'music_entertainment'
  | 'finance'
  | 'messaging';

export type ConnectorAuthType = 'oauth2' | 'pkce' | 'oauth1a' | 'api_key' | 'native';

export type ConnectorPlatform = 'all' | 'macos' | 'windows' | 'linux';

export interface ConnectorDefinition {
  id: string;
  displayName: string;
  description: string;
  category: ConnectorCategory;
  authType: ConnectorAuthType;
  platform: ConnectorPlatform;
  isPremium: boolean;
  /** Sync interval in hours. 0 = manual only. */
  syncIntervalHours: number;
}

export interface ConnectorState {
  connectorId: string;
  status: ConnectorStatus;
  userEmail?: string;
  lastSyncedAt?: string;
  errorMessage?: string;
  itemCount?: number;
}
