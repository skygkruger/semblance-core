export interface TermsAcceptanceStepProps {
  /** Called when user accepts terms */
  onAccept: () => void;
  /** Optional: Terms version (defaults to "1.0") */
  termsVersion?: string;
  /** Optional className for web */
  className?: string;
}
