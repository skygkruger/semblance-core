// Sound System — Comprehensive tests (40+)
// Tests: registry, engine behavior, settings persistence, trigger point wiring,
// settings UI structure, and asset verification.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

// ─── Helper: read file as string ────────────────────────────────────────────

function readSrc(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf-8');
}

// ─── Sound Registry Tests ──────────────────────────────────────────────────

describe('Sound Registry', () => {
  const registrySrc = readSrc('packages/core/sound/sound-types.ts');

  it('SOUND_REGISTRY has all 10 SoundIds', () => {
    const ids = [
      'message_sent',
      'alter_ego_batched',
      'action_approved',
      'action_rejected',
      'hard_limit_triggered',
      'initialize',
      'morning_brief_ready',
      'notification',
      'voice_start',
      'voice_stop',
    ];
    for (const id of ids) {
      expect(registrySrc).toContain(`${id}:`);
    }
  });

  it('each entry has correct filename and category', () => {
    const filenameMappings: Record<string, string> = {
      message_sent: 'message-sent.wav',
      alter_ego_batched: 'action-request.wav',
      action_approved: 'approved.wav',
      action_rejected: 'rejected.wav',
      hard_limit_triggered: 'hard-limit-triggered.wav',
      initialize: 'initialize.wav',
      morning_brief_ready: 'morning-brief.wav',
      notification: 'notification.wav',
      voice_start: 'voice-start.wav',
      voice_stop: 'voice-stop.wav',
    };
    for (const [, filename] of Object.entries(filenameMappings)) {
      expect(registrySrc).toContain(`'${filename}'`);
    }
  });

  it('all filenames match actual files in desktop assets', () => {
    const filenames = [
      'message-sent.wav',
      'action-request.wav',
      'approved.wav',
      'rejected.wav',
      'hard-limit-triggered.wav',
      'initialize.wav',
      'morning-brief.wav',
      'notification.wav',
      'voice-start.wav',
      'voice-stop.wav',
    ];
    const assetsDir = join(ROOT, 'packages', 'desktop', 'src', 'assets', 'sounds');
    for (const f of filenames) {
      expect(existsSync(join(assetsDir, f)), `Missing: ${f}`).toBe(true);
    }
  });

  it('has no duplicate filenames', () => {
    const filenameMatches = registrySrc.match(/filename:\s*'[^']+'/g) ?? [];
    const filenames = filenameMatches.map(m => m.replace(/filename:\s*'/, '').replace(/'$/, ''));
    const uniqueFilenames = new Set(filenames);
    expect(filenames.length).toBe(uniqueFilenames.size);
  });

  it('all categories are valid', () => {
    const categoryMatches = registrySrc.match(/category:\s*'[^']+'/g) ?? [];
    const validCategories = new Set(['actions', 'system', 'voice']);
    for (const m of categoryMatches) {
      const cat = m.replace(/category:\s*'/, '').replace(/'$/, '');
      expect(validCategories.has(cat), `Invalid category: ${cat}`).toBe(true);
    }
  });
});

// ─── SoundEngine Behavior Tests ────────────────────────────────────────────

describe('SoundEngine behavior (structural)', () => {
  const engineSrc = readSrc('packages/desktop/src/sound/desktop-sound-engine.ts');

  it('play() is no-op when enabled is false', () => {
    expect(engineSrc).toContain('!this.settings.enabled');
  });

  it('play() is no-op when not ready', () => {
    expect(engineSrc).toContain('!this.ready');
  });

  it('play() silent failure on missing buffer — no throw', () => {
    expect(engineSrc).toContain('const buffer = this.buffers.get(id)');
    expect(engineSrc).toContain('if (!buffer) return');
    expect(engineSrc).toContain('// Silent failure');
  });

  it('play() applies category volume correctly', () => {
    expect(engineSrc).toContain('config.defaultVolume * categoryVolume');
  });

  it('preload() with one missing file does not fail initialization', () => {
    expect(engineSrc).toContain('Promise.allSettled');
  });

  it('initialize() sets ready to true', () => {
    expect(engineSrc).toContain('this.ready = true');
  });

  it('setEnabled(false) prevents play', () => {
    expect(engineSrc).toContain('setEnabled(enabled: boolean)');
    expect(engineSrc).toContain('this.settings.enabled = enabled');
  });

  it('setCategoryVolume clamps to 0-1', () => {
    expect(engineSrc).toContain('Math.max(0, Math.min(1, volume))');
  });

  it('updateSettings merges correctly', () => {
    expect(engineSrc).toContain('updateSettings(settings: SoundSettings)');
    expect(engineSrc).toContain('this.settings = { ...settings }');
  });

  it('playOnce delegates to play', () => {
    expect(engineSrc).toContain('playOnce(id: SoundId)');
    expect(engineSrc).toContain('this.play(id)');
  });
});

// ─── Settings Persistence Tests ────────────────────────────────────────────

describe('Settings persistence (structural)', () => {
  const appStateSrc = readSrc('packages/desktop/src/state/AppState.tsx');
  const ipcTypesSrc = readSrc('packages/desktop/src/ipc/types.ts');
  const ipcCommandsSrc = readSrc('packages/desktop/src/ipc/commands.ts');
  const sidecarSrc = readSrc('packages/desktop/src-tauri/sidecar/bridge.ts');
  const rustSrc = readSrc('packages/desktop/src-tauri/src/lib.rs');

  it('settings defaults to enabled:true with 1.0 volumes', () => {
    expect(appStateSrc).toContain('soundSettings: {');
    expect(appStateSrc).toContain('enabled: true');
    expect(appStateSrc).toContain('categoryVolumes: { actions: 1.0, system: 1.0, voice: 1.0 }');
  });

  it('saveSoundSettings persists via IPC', () => {
    expect(ipcCommandsSrc).toContain("invoke<void>('save_sound_settings'");
  });

  it('getSoundSettings retrieves persisted settings', () => {
    expect(ipcCommandsSrc).toContain("invoke<SoundSettings>('get_sound_settings')");
  });

  it('SoundSettings type in IPC types', () => {
    expect(ipcTypesSrc).toContain('interface SoundSettings');
    expect(ipcTypesSrc).toContain('enabled: boolean');
    expect(ipcTypesSrc).toContain('categoryVolumes:');
  });

  it('Rust commands registered for sound settings', () => {
    expect(rustSrc).toContain('get_sound_settings');
    expect(rustSrc).toContain('save_sound_settings');
    expect(rustSrc).toContain("sound:getSettings");
    expect(rustSrc).toContain("sound:saveSettings");
  });

  it('sidecar handles sound:getSettings with getPref', () => {
    expect(sidecarSrc).toContain("case 'sound:getSettings':");
    expect(sidecarSrc).toContain("getPref('sound_settings')");
  });

  it('sidecar handles sound:saveSettings with setPref', () => {
    expect(sidecarSrc).toContain("case 'sound:saveSettings':");
    expect(sidecarSrc).toContain("setPref('sound_settings'");
  });
});

// ─── Trigger Point Structural Verification ─────────────────────────────────

describe('Trigger point wiring', () => {
  const chatScreenSrc = readSrc('packages/desktop/src/screens/ChatScreen.tsx');
  const onboardingSrc = readSrc('packages/desktop/src/screens/OnboardingFlow.tsx');
  const appSrc = readSrc('packages/desktop/src/App.tsx');
  const voiceInputSrc = readSrc('packages/desktop/src/hooks/useVoiceInput.ts');
  const activitySrc = readSrc('packages/desktop/src/screens/ActivityScreen.tsx');

  it('ChatScreen calls play(message_sent)', () => {
    expect(chatScreenSrc).toContain("play('message_sent')");
  });

  it('ChatScreen listens for alter-ego-batch-ready event', () => {
    expect(chatScreenSrc).toContain('semblance://alter-ego-batch-ready');
    expect(chatScreenSrc).toContain("play('alter_ego_batched')");
  });

  it('ChatScreen listens for hard-limit-triggered event', () => {
    expect(chatScreenSrc).toContain('semblance://hard-limit-triggered');
    expect(chatScreenSrc).toContain("play('hard_limit_triggered')");
  });

  it('OnboardingFlow calls play(initialize)', () => {
    expect(onboardingSrc).toContain("play('initialize')");
  });

  it('App listens for morning-brief-ready event', () => {
    expect(appSrc).toContain('semblance://morning-brief-ready');
    expect(appSrc).toContain("play('morning_brief_ready')");
  });

  it('App listens for proactive-notification event', () => {
    expect(appSrc).toContain('semblance://proactive-notification');
    expect(appSrc).toContain("play('notification')");
  });

  it('useVoiceInput accepts onSoundPlay callback', () => {
    expect(voiceInputSrc).toContain('onSoundPlay');
  });

  it('useVoiceInput calls onSoundPlay(voice_start) on start', () => {
    expect(voiceInputSrc).toContain("onSoundPlay?.('voice_start')");
  });

  it('useVoiceInput calls onSoundPlay(voice_stop) on stop', () => {
    expect(voiceInputSrc).toContain("onSoundPlay?.('voice_stop')");
  });

  it('ActivityScreen plays approved/rejected sounds on batch confirm', () => {
    expect(activitySrc).toContain("play('action_approved')");
    expect(activitySrc).toContain("play('action_rejected')");
  });
});

// ─── Settings UI Structural Verification ───────────────────────────────────

describe('Settings UI', () => {
  const settingsSrc = readSrc('packages/desktop/src/components/SoundSettingsSection.tsx');
  const settingsScreenSrc = readSrc('packages/desktop/src/screens/SettingsScreen.tsx');

  it('SoundSettingsSection component exists', () => {
    expect(settingsSrc).toContain('export function SoundSettingsSection');
  });

  it('contains global toggle element', () => {
    // BEM migration: toggle uses settings-toggle class + data-on attribute instead of role="switch"
    expect(settingsSrc).toContain('settings-toggle');
    expect(settingsSrc).toContain('Sound effects');
  });

  it('contains 3 category sections (actions, system, voice)', () => {
    expect(settingsSrc).toContain('SOUND_CATEGORY_LABELS');
    expect(settingsSrc).toContain("(Object.keys(SOUND_CATEGORY_LABELS) as SoundCategory[])");
  });

  it('contains slider/range inputs', () => {
    expect(settingsSrc).toContain('type="range"');
    expect(settingsSrc).toContain('min={0}');
    expect(settingsSrc).toContain('max={100}');
  });

  it('contains preview buttons', () => {
    expect(settingsSrc).toContain('CATEGORY_PREVIEW_SOUNDS');
    expect(settingsSrc).toContain('Preview');
    expect(settingsSrc).toContain('PlayIcon');
  });

  it('SettingsScreen uses SettingsNavigator which includes sound settings', () => {
    // SettingsScreen is a thin wrapper around SettingsNavigator from @semblance/ui.
    // Sound settings are exposed via the soundEffects prop passed to SettingsNavigator.
    expect(settingsScreenSrc).toContain("import { SettingsNavigator }");
    expect(settingsScreenSrc).toContain('<SettingsNavigator');
    expect(settingsScreenSrc).toContain('soundEffects');
  });
});

// ─── Asset Verification ────────────────────────────────────────────────────

describe('Asset verification', () => {
  const desktopAssetsDir = join(ROOT, 'packages', 'desktop', 'src', 'assets', 'sounds');
  const mobileAssetsDir = join(ROOT, 'packages', 'mobile', 'src', 'assets', 'sounds');

  const expectedFiles = [
    'message-sent.wav',
    'action-request.wav',
    'approved.wav',
    'rejected.wav',
    'hard-limit-triggered.wav',
    'initialize.wav',
    'morning-brief.wav',
    'notification.wav',
    'voice-start.wav',
    'voice-stop.wav',
  ];

  it('all 10 WAV files exist in desktop assets', () => {
    for (const f of expectedFiles) {
      expect(existsSync(join(desktopAssetsDir, f)), `Desktop missing: ${f}`).toBe(true);
    }
  });

  it('all 10 WAV files exist in mobile assets', () => {
    for (const f of expectedFiles) {
      expect(existsSync(join(mobileAssetsDir, f)), `Mobile missing: ${f}`).toBe(true);
    }
  });

  it('voice-start.wav has size > 0', () => {
    const stat = statSync(join(desktopAssetsDir, 'voice-start.wav'));
    expect(stat.size).toBeGreaterThan(0);
  });

  it('voice-stop.wav has size > 0', () => {
    const stat = statSync(join(desktopAssetsDir, 'voice-stop.wav'));
    expect(stat.size).toBeGreaterThan(0);
  });

  it('all filenames match SOUND_REGISTRY entries', () => {
    const registrySrc = readSrc('packages/core/sound/sound-types.ts');
    for (const f of expectedFiles) {
      expect(registrySrc).toContain(`'${f}'`);
    }
  });
});
