export interface IntentCaptureProps {
  onComplete: (responses: { primaryGoal: string; hardLimit: string; personalValue: string }) => void;
  onSkip?: () => void;
}
