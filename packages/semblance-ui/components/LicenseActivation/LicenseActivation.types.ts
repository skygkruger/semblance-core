export interface LicenseActivationProps {
  /** Called when the user submits a license key */
  onActivate: (key: string) => Promise<{ success: boolean; error?: string }>;
  /** Whether the user already has an active license */
  alreadyActive?: boolean;
  /** Additional CSS class */
  className?: string;
}
