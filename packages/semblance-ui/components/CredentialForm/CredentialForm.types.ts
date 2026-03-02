export interface ProviderPreset {
  name: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  caldavUrl: string | null;
  notes: string | null;
}

export interface CredentialFormData {
  serviceType: 'email' | 'calendar';
  protocol: 'imap' | 'smtp' | 'caldav';
  host: string;
  port: number;
  username: string;
  password: string;
  useTLS: boolean;
  displayName: string;
}

export interface CredentialFormProps {
  serviceType: 'email' | 'calendar';
  presets?: Record<string, ProviderPreset>;
  onSave: (credentials: CredentialFormData[]) => Promise<void>;
  onTest: (credential: CredentialFormData) => Promise<{ success: boolean; error?: string }>;
  onCancel: () => void;
}

export const PROVIDERS = ['gmail', 'outlook', 'icloud', 'fastmail', 'protonmail'] as const;

export const PROVIDER_LABELS: Record<string, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  icloud: 'iCloud',
  fastmail: 'Fastmail',
  protonmail: 'Proton Mail',
};
