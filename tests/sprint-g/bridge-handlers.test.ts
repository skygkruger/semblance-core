import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const BRIDGE = readFileSync(join(ROOT, 'packages/desktop/src-tauri/sidecar/bridge.ts'), 'utf-8');

describe('Sprint G — Bridge Handler Registration', () => {
  // 5 OAuth multi-account handlers
  const oauthHandlers = [
    'oauth_list_accounts',
    'oauth_list_provider_accounts',
    'oauth_set_primary',
    'oauth_remove_account',
    'oauth_add_account',
  ];

  // 3 channel handlers
  const channelHandlers = [
    'channel_whatsapp_get_qr',
    'channel_signal_check_install',
    'channel_slack_set_tokens',
  ];

  // 7 skill registry handlers
  const skillHandlers = [
    'skill_list',
    'skill_install',
    'skill_uninstall',
    'skill_enable',
    'skill_disable',
    'skill_get_declaration',
    'skill_list_capabilities',
  ];

  // 3 sub-agent handlers
  const subAgentHandlers = [
    'sub_agent_create',
    'sub_agent_list',
    'sub_agent_terminate',
  ];

  const allHandlers = [...oauthHandlers, ...channelHandlers, ...skillHandlers, ...subAgentHandlers];

  for (const handler of allHandlers) {
    it(`has handler for '${handler}'`, () => {
      expect(BRIDGE).toContain(`case '${handler}':`);
    });
  }

  it('has all 18 Sprint G handlers (5 OAuth + 3 channel + 7 skill + 3 sub-agent)', () => {
    expect(allHandlers.length).toBe(18);
    for (const handler of allHandlers) {
      expect(BRIDGE).toContain(`case '${handler}':`);
    }
  });
});

describe('Sprint G — Imports', () => {
  it('imports SignalChannelAdapter', () => {
    expect(BRIDGE).toContain("import { SignalChannelAdapter }");
  });

  it('imports SlackChannelAdapter', () => {
    expect(BRIDGE).toContain("import { SlackChannelAdapter }");
  });

  it('imports WhatsAppChannelAdapter', () => {
    expect(BRIDGE).toContain("import { WhatsAppChannelAdapter }");
  });

  it('imports SkillRegistry', () => {
    expect(BRIDGE).toContain("import { SkillRegistry }");
  });

  it('imports SubAgentCoordinator', () => {
    expect(BRIDGE).toContain("import { SubAgentCoordinator }");
  });
});

describe('Sprint G — File Existence', () => {
  it('signal-adapter.ts exists and uses SystemCommandGateway', () => {
    const src = readFileSync(join(ROOT, 'packages/gateway/channels/signal/signal-adapter.ts'), 'utf-8');
    expect(src).toContain('SystemCommandGateway');
    expect(src).not.toContain("exec(");
    expect(src).not.toContain("spawn(");
    expect(src).toContain('sanitizeInboundContent');
  });

  it('slack-channel-adapter.ts exists and is distinct from services/slack/slack-adapter.ts', () => {
    const channelSrc = readFileSync(join(ROOT, 'packages/gateway/channels/slack/slack-channel-adapter.ts'), 'utf-8');
    expect(channelSrc).toContain("channelId = 'slack'");
    expect(channelSrc).toContain('Socket Mode');
    expect(channelSrc).toContain('sanitizeInboundContent');
  });

  it('whatsapp-adapter.ts exists with QR code support', () => {
    const src = readFileSync(join(ROOT, 'packages/gateway/channels/whatsapp/whatsapp-adapter.ts'), 'utf-8');
    expect(src).toContain("channelId = 'whatsapp'");
    expect(src).toContain('getQRCode');
    expect(src).toContain('sanitizeInboundContent');
    expect(src).toContain('baileys');
  });

  it('skill-declaration.ts exists with validation', () => {
    const src = readFileSync(join(ROOT, 'packages/core/skills/skill-declaration.ts'), 'utf-8');
    expect(src).toContain('validateSkillDeclaration');
    expect(src).toContain('SkillCapability');
    expect(src).toContain('REVERSE_DOMAIN_REGEX');
  });

  it('skill-registry.ts exists with SQLite schema', () => {
    const src = readFileSync(join(ROOT, 'packages/core/skills/skill-registry.ts'), 'utf-8');
    expect(src).toContain('installed_skills');
    expect(src).toContain('install');
    expect(src).toContain('uninstall');
    expect(src).toContain('loadAll');
  });

  it('sub-agent-coordinator.ts exists', () => {
    const src = readFileSync(join(ROOT, 'packages/core/agent/sub-agent-coordinator.ts'), 'utf-8');
    expect(src).toContain('SubAgentCoordinator');
    expect(src).toContain('createSubAgent');
    expect(src).toContain('terminateSubAgent');
    expect(src).toContain('allowedTools');
  });
});

describe('Sprint G — Multi-Account Migration', () => {
  it('OAuthTokenManager has multi-account methods', () => {
    const src = readFileSync(join(ROOT, 'packages/gateway/services/oauth-token-manager.ts'), 'utf-8');
    expect(src).toContain('migrateToMultiAccount');
    expect(src).toContain('storeAccountTokens');
    expect(src).toContain('listAccounts');
    expect(src).toContain('listAllAccounts');
    expect(src).toContain('setPrimary');
    expect(src).toContain('removeAccount');
    expect(src).toContain('getPrimaryAccount');
    expect(src).toContain('OAuthAccount');
    expect(src).toContain('account_id TEXT PRIMARY KEY');
    expect(src).toContain('is_primary INTEGER');
  });
});
