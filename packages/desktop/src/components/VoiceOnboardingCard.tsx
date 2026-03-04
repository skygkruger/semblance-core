// VoiceOnboardingCard — Download prompt card for voice models.

import { Card, Button, StatusIndicator } from '@semblance/ui';
import './VoiceOnboardingCard.css';

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
      <h3 className="voice-onboard__title">Voice Models Needed</h3>
      <p className="voice-onboard__desc">
        Semblance uses local AI models for voice. Models are downloaded once and run entirely on your device.
      </p>

      <div className="voice-onboard__models">
        <div className="voice-onboard__model-row">
          <div className="voice-onboard__model-info">
            <StatusIndicator status={whisperDownloaded ? 'success' : 'attention'} />
            <div>
              <p className="voice-onboard__model-name">Speech Recognition (Whisper)</p>
              <p className="voice-onboard__model-size">{whisperSizeMb} MB</p>
            </div>
          </div>
          {!whisperDownloaded && (
            <Button variant="ghost" size="sm" onClick={onDownloadWhisper} disabled={downloading}>
              {downloading ? 'Downloading...' : 'Download'}
            </Button>
          )}
        </div>

        <div className="voice-onboard__model-row">
          <div className="voice-onboard__model-info">
            <StatusIndicator status={piperDownloaded ? 'success' : 'attention'} />
            <div>
              <p className="voice-onboard__model-name">Text-to-Speech (Piper)</p>
              <p className="voice-onboard__model-size">{piperSizeMb} MB</p>
            </div>
          </div>
          {!piperDownloaded && (
            <Button variant="ghost" size="sm" onClick={onDownloadPiper} disabled={downloading}>
              {downloading ? 'Downloading...' : 'Download'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
