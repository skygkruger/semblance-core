import { useState, useEffect } from 'react';
import { SkeletonCard } from '@semblance/ui';
import { getVoiceModelStatus, prefGet } from '../ipc/commands';
import { useAppDispatch } from '../state/AppState';
import { VoiceSettingsSection } from '../components/VoiceSettingsSection';
import { ContentBracket } from '../components/ContentBracket';
import { GhostSprite } from '../components/GhostSprite';

const STORAGE_KEY = 'semblance.voice_settings';

export function VoiceSettingsScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const dispatch = useAppDispatch();

  useEffect(() => {
    async function loadData() {
      try {
        // Load persisted voice preferences from SQLite
        let speed = 1.0;
        let whisperModel: string | null = null;
        let piperVoice: string | null = null;

        const saved = await prefGet(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          speed = parsed.speed ?? 1.0;
        }

        // Check actual voice capability via IPC
        try {
          const modelStatus = await getVoiceModelStatus();
          if (modelStatus.whisperDownloaded) whisperModel = 'whisper-tiny';
          if (modelStatus.piperDownloaded) piperVoice = 'piper-default';
        } catch {
          // IPC command may not exist yet — default to not-available (honest state)
          console.info('[VoiceSettingsScreen] voice model status not available — native integration not yet wired');
        }

        // Dispatch loaded data into AppState for the component
        dispatch({
          type: 'SET_VOICE_SETTINGS',
          settings: {
            enabled: false,
            whisperModel,
            piperVoice,
            speed,
            silenceSensitivity: 'medium' as const,
          },
        });
      } catch (err) {
        console.error('[VoiceSettingsScreen] load failed:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [dispatch]);

  if (isLoading) {
    return (
      <div className="page-scroll">
        <div className="page-layout">
          <ContentBracket>
          <GhostSprite insight="Voice processing happens entirely on your device.">
          <SkeletonCard variant="generic" message="Loading voice settings" subMessage="Checking audio capabilities" showSpinner />
          </GhostSprite>
          </ContentBracket>
        </div>
      </div>
    );
  }

  return (
    <div className="page-scroll">
      <div className="page-layout">
        <ContentBracket>
        <GhostSprite insight="Voice processing happens entirely on your device.">
        <VoiceSettingsSection />
        </GhostSprite>
        </ContentBracket>
      </div>
    </div>
  );
}
