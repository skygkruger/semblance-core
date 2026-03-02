// Navigation Types — Type-safe navigation for the mobile app.
// Bottom tabs: Chat, Brief, Knowledge, Privacy, Settings.
// Stack screens within each tab as needed.

/** Bottom tab navigator param list */
export type TabParamList = {
  Chat: undefined;
  Brief: undefined;
  Knowledge: undefined;
  Privacy: undefined;
  Settings: undefined;
};

/** Root stack navigator param list */
export type RootStackParamList = {
  Onboarding: undefined;
  Main: undefined;
  EmailDetail: { emailId: string };
  ReminderDetail: { reminderId: string };
  NetworkMonitor: undefined;
  ActionLog: undefined;
  PairedDevices: undefined;
  ModelStorage: undefined;
  WritingStyle: undefined;
  WebSearchSettings: undefined;
  AutonomySettings: undefined;
  ContactDetail: { contactId: string };
  MessageCompose: { contactId: string; draftBody: string };
  LocationSettings: undefined;
  VoiceSettings: undefined;
  CloudStorageSettings: undefined;
  KnowledgeGraph: undefined;
  ImportDigitalLife: undefined;
  // Sovereignty screens
  LivingWill: undefined;
  Witness: { attestationId?: string };
  Inheritance: undefined;
  InheritanceActivation: undefined;
  Network: undefined;
  // Adversarial screens
  AdversarialDashboard: undefined;
  // Privacy screens
  PrivacyDashboard: undefined;
  ProofOfPrivacy: undefined;
  // Security screens
  BiometricSetup: undefined;
  Backup: undefined;
};

/** Tab icon names for each tab */
export const TAB_ICONS: Record<keyof TabParamList, string> = {
  Chat: 'chat',
  Brief: 'sunrise',
  Knowledge: 'brain',
  Privacy: 'shield',
  Settings: 'settings',
};
