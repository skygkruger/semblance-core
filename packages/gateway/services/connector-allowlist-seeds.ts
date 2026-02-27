/**
 * Connector Allowlist Seeds — Maps connector IDs to their required API domains.
 *
 * When a connector authenticates, these domains are auto-added to the Gateway allowlist
 * so the adapter can make API calls without manual allowlist configuration.
 */

export const CONNECTOR_ALLOWLIST_SEEDS: Record<string, string[]> = {
  // Cloud Storage
  'google-drive': [
    'accounts.google.com',
    'oauth2.googleapis.com',
    'www.googleapis.com',
  ],
  'dropbox': [
    'www.dropbox.com',
    'api.dropboxapi.com',
    'content.dropboxapi.com',
  ],
  'onedrive': [
    'login.microsoftonline.com',
    'graph.microsoft.com',
  ],
  'box': [
    'account.box.com',
    'api.box.com',
    'upload.box.com',
  ],

  // Productivity
  'notion': [
    'api.notion.com',
  ],
  'todoist': [
    'todoist.com',
    'api.todoist.com',
  ],
  'harvest': [
    'id.getharvest.com',
    'api.harvestapp.com',
  ],
  'slack-oauth': [
    'slack.com',
    'api.slack.com',
  ],

  // Developer
  'github': [
    'github.com',
    'api.github.com',
  ],

  // Reading & Research
  'readwise': [
    'readwise.io',
  ],
  'pocket': [
    'getpocket.com',
  ],
  'instapaper': [
    'www.instapaper.com',
  ],
  'mendeley': [
    'api.mendeley.com',
  ],

  // Health & Fitness
  'oura': [
    'cloud.ouraring.com',
    'api.ouraring.com',
  ],
  'whoop': [
    'api.prod.whoop.com',
  ],
  'fitbit': [
    'www.fitbit.com',
    'api.fitbit.com',
  ],
  'strava': [
    'www.strava.com',
    'api.strava.com',
  ],
  'garmin': [
    'connectapi.garmin.com',
    'apis.garmin.com',
  ],
  'toggl': [
    'api.track.toggl.com',
  ],
  'rescuetime': [
    'www.rescuetime.com',
  ],

  // Music & Entertainment
  'spotify': [
    'accounts.spotify.com',
    'api.spotify.com',
  ],
  'lastfm': [
    'ws.audioscrobbler.com',
    'www.last.fm',
  ],
  'letterboxd': [
    'api.letterboxd.com',
  ],
};

/**
 * Get the allowlist domains for a connector.
 * Returns empty array for native/import-only connectors.
 */
export function getAllowlistDomainsForConnector(connectorId: string): string[] {
  return CONNECTOR_ALLOWLIST_SEEDS[connectorId] ?? [];
}
