/**
 * Connector Adapter Registration — Registers all OAuth/API adapters with the ConnectorRouter.
 *
 * Call registerAllConnectors() at Gateway startup to wire all adapters.
 * Each adapter is registered by its connectorId (matching ConnectorRegistry IDs).
 *
 * GATEWAY-SIDE: This file lives in packages/gateway/. It has full network access.
 */

import type { ActionType } from '@semblance/core';
import type { OAuthTokenManager } from './oauth-token-manager.js';
import type { ServiceAdapter } from './types.js';
import { ConnectorRouter } from './connector-router.js';

// ─── Phase 3 — Core OAuth Adapters ────────────────────────────────────────────
import { SpotifyAdapter } from './spotify/spotify-adapter.js';
import { GitHubAdapter } from './github/github-adapter.js';
import { ReadwiseAdapter } from './readwise/readwise-adapter.js';
import { NotionAdapter } from './notion/notion-adapter.js';
import { DropboxAdapter } from './dropbox/dropbox-adapter.js';
import { OneDriveAdapter } from './onedrive/onedrive-adapter.js';

// ─── Phase 4 — Health & Fitness OAuth Adapters ────────────────────────────────
import { OuraAdapter } from './oura/oura-adapter.js';
import { WhoopAdapter } from './whoop/whoop-adapter.js';
import { FitbitAdapter } from './fitbit/fitbit-adapter.js';
import { StravaAdapter } from './strava/strava-adapter.js';
import { GarminAdapter } from './garmin/garmin-adapter.js';
import { TogglAdapter } from './toggl/toggl-adapter.js';
import { RescueTimeAdapter } from './rescuetime/rescuetime-adapter.js';

// ─── Phase 5 — Remaining OAuth + Social Adapters ──────────────────────────────
import { PocketAdapter } from './pocket/pocket-adapter.js';
import { InstapaperAdapter } from './instapaper/instapaper-adapter.js';
import { TodoistAdapter } from './todoist/todoist-adapter.js';
import { LastFmAdapter } from './lastfm/lastfm-adapter.js';
import { LetterboxdAdapter } from './letterboxd/letterboxd-adapter.js';
import { MendeleyAdapter } from './mendeley/mendeley-adapter.js';
import { HarvestAdapter } from './harvest/harvest-adapter.js';
import { SlackAdapter } from './slack/slack-adapter.js';
import { BoxAdapter } from './box/box-adapter.js';

/**
 * Create and register all connector adapters with a ConnectorRouter.
 * Returns the fully-configured ConnectorRouter instance.
 */
export function registerAllConnectors(tokenManager: OAuthTokenManager): ConnectorRouter {
  const router = new ConnectorRouter();

  // Phase 3 — Core OAuth
  router.registerAdapter('spotify', new SpotifyAdapter(tokenManager));
  router.registerAdapter('github', new GitHubAdapter(tokenManager));
  router.registerAdapter('readwise', new ReadwiseAdapter(tokenManager));
  router.registerAdapter('notion', new NotionAdapter(tokenManager));
  router.registerAdapter('dropbox', new DropboxAdapter(tokenManager));
  router.registerAdapter('onedrive', new OneDriveAdapter(tokenManager));

  // Phase 4 — Health & Fitness
  router.registerAdapter('oura', new OuraAdapter(tokenManager));
  router.registerAdapter('whoop', new WhoopAdapter(tokenManager));
  router.registerAdapter('fitbit', new FitbitAdapter(tokenManager));
  router.registerAdapter('strava', new StravaAdapter(tokenManager));
  router.registerAdapter('garmin', new GarminAdapter(tokenManager));
  router.registerAdapter('toggl', new TogglAdapter(tokenManager));
  router.registerAdapter('rescuetime', new RescueTimeAdapter(tokenManager));

  // Phase 5 — Remaining OAuth + Social
  router.registerAdapter('pocket', new PocketAdapter(tokenManager));
  router.registerAdapter('instapaper', new InstapaperAdapter(tokenManager));
  router.registerAdapter('todoist', new TodoistAdapter(tokenManager));
  router.registerAdapter('lastfm', new LastFmAdapter(
    tokenManager,
    process.env['LASTFM_API_KEY'] ?? 'PLACEHOLDER_API_KEY',
    process.env['LASTFM_API_SECRET'] ?? 'PLACEHOLDER_API_SECRET',
  ));
  router.registerAdapter('letterboxd', new LetterboxdAdapter(
    tokenManager,
    process.env['LETTERBOXD_API_KEY'] ?? 'PLACEHOLDER_API_KEY',
    process.env['LETTERBOXD_API_SECRET'] ?? 'PLACEHOLDER_API_SECRET',
  ));
  router.registerAdapter('mendeley', new MendeleyAdapter(tokenManager));
  router.registerAdapter('harvest', new HarvestAdapter(tokenManager));
  router.registerAdapter('slack-oauth', new SlackAdapter(tokenManager));
  router.registerAdapter('box', new BoxAdapter(tokenManager));

  return router;
}

/**
 * Register the ConnectorRouter with a ServiceRegistry for all connector.* action types.
 */
export function wireConnectorRouter(
  registry: { register: (action: ActionType, adapter: ServiceAdapter) => void },
  router: ConnectorRouter,
): void {
  const connectorActions: ActionType[] = [
    'connector.auth',
    'connector.auth_status',
    'connector.disconnect',
    'connector.sync',
    'connector.list_items',
  ];

  for (const action of connectorActions) {
    registry.register(action, router);
  }
}
