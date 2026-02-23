// VoiceOnboardingCard — Download prompt card for voice models.
// Shown when voice is enabled but models not yet downloaded.

import { Card, Button, StatusIndicator } from '@semblance/ui';

interface VoiceOnboardingCardProps {
  whisperDownloaded: boolean;
  piperDownloaded: boolean;
  whisperSizeMb: number;
  piperSizeMb: number;
  onDownloadWhisper: () => void;
  onDownloadPiper: () => void;
  downloading: boolean;
}

export function VoiceOnboardingCard({
  whisperDownloaded,
  piperDownloaded,
  whisperSizeMb,
  piperSizeMb,
  onDownloadWhisper,
  onDownloadPiper,
  downloading,
}: VoiceOnboardingCardProps) {
  if (whisperDownloaded && piperDownloaded) return null;

  return (
    <Card>
      <h3 className="text-sm font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-3">
        Voice Models Needed
      </h3>
      <p className="text-xs text-semblance-text-tertiary mb-4">
        Semblance uses local AI models for voice. Models are downloaded once and run entirely on your device.
      </p>

      <div className="space-y-3">
        {/* Whisper STT */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIndicator status={whisperDownloaded ? 'success' : 'attention'} />
            <div>
              <p className="text-sm text-semblance-text-primary dark:text-semblance-text-primary-dark">
                Speech Recognition (Whisper)
              </p>
              <p className="text-xs text-semblance-text-tertiary">
                {whisperSizeMb} MB
              </p>
            </div>
          </div>
          {!whisperDownloaded && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onDownloadWhisper}
              disabled={downloading}
            >
              {downloading ? 'Downloading...' : 'Download'}
            </Button>
          )}
        </div>

        {/* Piper TTS */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIndicator status={piperDownloaded ? 'success' : 'attention'} />
            <div>
              <p className="text-sm text-semblance-text-primary dark:text-semblance-text-primary-dark">
                Text-to-Speech (Piper)
              </p>
              <p className="text-xs text-semblance-text-tertiary">
                {piperSizeMb} MB
              </p>
            </div>
          </div>
          {!piperDownloaded && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onDownloadPiper}
              disabled={downloading}
            >
              {downloading ? 'Downloading...' : 'Download'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
