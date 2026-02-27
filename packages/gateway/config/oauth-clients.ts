/**
 * OAuth Client Configuration — Client IDs loaded from environment variables.
 *
 * Client IDs are public values (safe to include in source).
 * Client Secrets are loaded from env vars at runtime only.
 * PKCE-based flows don't need client secrets at all.
 *
 * CRITICAL: No secrets in code. All secrets from env vars.
 */

export interface OAuthClientConfig {
  clientId: string;
  clientSecret?: string;
}

function envOrDefault(envVar: string, defaultValue: string): string {
  return process.env[envVar] ?? defaultValue;
}

function envOrUndefined(envVar: string): string | undefined {
  return process.env[envVar] ?? undefined;
}

/** Placeholder value used when no env var is set. Adapters check for this. */
export const PLACEHOLDER_CLIENT_ID = 'CONFIGURE_IN_ENV';

export const oauthClients = {
  google: {
    clientId: envOrDefault('SEMBLANCE_GOOGLE_CLIENT_ID', PLACEHOLDER_CLIENT_ID),
    clientSecret: envOrUndefined('SEMBLANCE_GOOGLE_CLIENT_SECRET'),
  },
  spotify: {
    clientId: envOrDefault('SEMBLANCE_SPOTIFY_CLIENT_ID', PLACEHOLDER_CLIENT_ID),
    // PKCE — no secret needed
  },
  github: {
    clientId: envOrDefault('SEMBLANCE_GITHUB_CLIENT_ID', PLACEHOLDER_CLIENT_ID),
    // PKCE — no secret needed
  },
  notion: {
    clientId: envOrDefault('SEMBLANCE_NOTION_CLIENT_ID', PLACEHOLDER_CLIENT_ID),
    clientSecret: envOrUndefined('SEMBLANCE_NOTION_CLIENT_SECRET'),
  },
  dropbox: {
    clientId: envOrDefault('SEMBLANCE_DROPBOX_CLIENT_ID', PLACEHOLDER_CLIENT_ID),
    clientSecret: envOrUndefined('SEMBLANCE_DROPBOX_CLIENT_SECRET'),
  },
  onedrive: {
    clientId: envOrDefault('SEMBLANCE_ONEDRIVE_CLIENT_ID', PLACEHOLDER_CLIENT_ID),
    clientSecret: envOrUndefined('SEMBLANCE_ONEDRIVE_CLIENT_SECRET'),
  },
  oura: {
    clientId: envOrDefault('SEMBLANCE_OURA_CLIENT_ID', PLACEHOLDER_CLIENT_ID),
    clientSecret: envOrUndefined('SEMBLANCE_OURA_CLIENT_SECRET'),
  },
  whoop: {
    clientId: envOrDefault('SEMBLANCE_WHOOP_CLIENT_ID', PLACEHOLDER_CLIENT_ID),
    // PKCE — no secret needed
  },
  fitbit: {
    clientId: envOrDefault('SEMBLANCE_FITBIT_CLIENT_ID', PLACEHOLDER_CLIENT_ID),
    // PKCE — no secret needed
  },
  strava: {
    clientId: envOrDefault('SEMBLANCE_STRAVA_CLIENT_ID', PLACEHOLDER_CLIENT_ID),
    clientSecret: envOrUndefined('SEMBLANCE_STRAVA_CLIENT_SECRET'),
  },
  garmin: {
    consumerKey: envOrDefault('SEMBLANCE_GARMIN_CONSUMER_KEY', PLACEHOLDER_CLIENT_ID),
    consumerSecret: envOrUndefined('SEMBLANCE_GARMIN_CONSUMER_SECRET'),
  },
  pocket: {
    clientId: envOrDefault('SEMBLANCE_POCKET_CONSUMER_KEY', PLACEHOLDER_CLIENT_ID),
    // Pocket uses non-standard OAuth
  },
  todoist: {
    clientId: envOrDefault('SEMBLANCE_TODOIST_CLIENT_ID', PLACEHOLDER_CLIENT_ID),
    clientSecret: envOrUndefined('SEMBLANCE_TODOIST_CLIENT_SECRET'),
  },
  mendeley: {
    clientId: envOrDefault('SEMBLANCE_MENDELEY_CLIENT_ID', PLACEHOLDER_CLIENT_ID),
    clientSecret: envOrUndefined('SEMBLANCE_MENDELEY_CLIENT_SECRET'),
  },
  harvest: {
    clientId: envOrDefault('SEMBLANCE_HARVEST_CLIENT_ID', PLACEHOLDER_CLIENT_ID),
    clientSecret: envOrUndefined('SEMBLANCE_HARVEST_CLIENT_SECRET'),
  },
  slack: {
    clientId: envOrDefault('SEMBLANCE_SLACK_CLIENT_ID', PLACEHOLDER_CLIENT_ID),
    clientSecret: envOrUndefined('SEMBLANCE_SLACK_CLIENT_SECRET'),
  },
  box: {
    clientId: envOrDefault('SEMBLANCE_BOX_CLIENT_ID', PLACEHOLDER_CLIENT_ID),
    clientSecret: envOrUndefined('SEMBLANCE_BOX_CLIENT_SECRET'),
  },
  instapaper: {
    consumerKey: envOrDefault('SEMBLANCE_INSTAPAPER_CONSUMER_KEY', PLACEHOLDER_CLIENT_ID),
    consumerSecret: envOrUndefined('SEMBLANCE_INSTAPAPER_CONSUMER_SECRET'),
  },
} as const;
