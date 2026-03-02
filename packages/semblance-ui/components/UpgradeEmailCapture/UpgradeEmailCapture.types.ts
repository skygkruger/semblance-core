export interface UpgradeEmailCaptureProps {
  /** Called with the email when user clicks Continue */
  onSubmit: (email: string) => void;
  /** Whether submission is in progress */
  loading?: boolean;
  /** Optional className for web */
  className?: string;
}
