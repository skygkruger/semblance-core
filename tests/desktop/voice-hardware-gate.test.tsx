// @vitest-environment jsdom
/**
 * Voice Hardware Gate Tests
 *
 * Tests that ChatScreen correctly gates voice UI via voiceCapable.
 * When hardware is not capable, no voice mic button should appear.
 * When hardware IS capable AND STT is ready, voice should be active.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { invoke, clearInvokeMocks } from '../helpers/mock-tauri';
import { _resetHardwareTierCache } from '../../packages/desktop/src/hooks/useHardwareTier';

// Mock i18n to avoid setup complexity
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`;
      return key;
    },
  }),
}));

// Mock AppState
const mockState = {
  chatMessages: [],
  isResponding: false,
  ollamaStatus: 'connected',
  activeModel: 'llama3',
  userName: 'TestUser',
  indexingStatus: { state: 'idle', filesScanned: 0, filesTotal: 0 },
  documentContext: null,
  chatAttachments: [],
  activeConversationId: null,
  conversations: [],
  historyPanelOpen: false,
  conversationSettings: { autoExpiryDays: null },
};

vi.mock('@semblance/desktop/state/AppState', () => ({
  useAppState: () => mockState,
  useAppDispatch: () => vi.fn(),
}));

// Mock useTauriEvent
vi.mock('../../packages/desktop/src/hooks/useTauriEvent', () => ({
  useTauriEvent: vi.fn(),
}));

function mockHardware(voiceCapable: boolean, tier = 'standard', totalRamMb = 16384) {
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'detect_hardware') return {
      tier,
      totalRamMb,
      cpuCores: 8,
      gpuName: null,
      gpuVramMb: null,
      os: 'Windows',
      arch: 'x86_64',
      voiceCapable,
    };
    return null;
  });
}

// Import after mocks are set up
import { ChatScreen } from '../../packages/desktop/src/screens/ChatScreen';

describe('Voice Hardware Gate (ChatScreen)', () => {
  beforeEach(() => {
    clearInvokeMocks();
    _resetHardwareTierCache();
  });

  it('AgentInput gets voiceEnabled=false when hardware not capable', async () => {
    mockHardware(false, 'constrained', 4096);
    render(<ChatScreen />);

    // Wait for hardware detection to complete
    await waitFor(() => {
      // The mic button should NOT appear
      expect(screen.queryByTestId('voice-mic-button')).toBeNull();
    });
  });

  it('AgentInput gets voiceEnabled=true when hardware capable AND STT ready', async () => {
    mockHardware(true, 'performance', 16384);
    render(<ChatScreen />);

    // Wait for both hardware detection and STT readiness check
    await waitFor(() => {
      expect(screen.getByTestId('voice-mic-button')).toBeTruthy();
    });
  });

  it('voice mic button absent when voiceCapable=false', async () => {
    mockHardware(false, 'constrained', 2048);
    render(<ChatScreen />);

    // Give time for all async effects to settle
    await waitFor(() => {
      const micButton = screen.queryByTestId('voice-mic-button');
      expect(micButton).toBeNull();
    });
  });
});
