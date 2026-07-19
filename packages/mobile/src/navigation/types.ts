// Navigation Types — Type-safe navigation for the mobile sovereign peer app.
// Bottom tabs: Today, Ask, Work, Vault, Proof, Capabilities.

/** Bottom tab navigator param list */
export type TabParamList = {
  TodayTab: undefined;
  AskTab: undefined;
  WorkTab: undefined;
  VaultTab: undefined;
  ProofTab: undefined;
  CapabilitiesTab: undefined;
};

/** Today tab stack */
export type TodayStackParamList = {
  Today: undefined;
  Brief: undefined;
  Digest: undefined;
};

/** Ask tab stack */
export type AskStackParamList = {
  Ask: undefined;
};

/** Work tab stack */
export type WorkStackParamList = {
  Work: undefined;
  Activity: undefined;
  Intent: undefined;
};

/** Vault tab stack */
export type VaultStackParamList = {
  Vault: undefined;
  ImportDigitalLife: undefined;
  Files: undefined;
};

/** Proof tab stack */
export type ProofStackParamList = {
  Proof: undefined;
  ProofOfPrivacy: undefined;
  SovereigntyReport: undefined;
};

/** Capabilities tab stack */
export type CapabilitiesStackParamList = {
  Capabilities: undefined;
  Connections: undefined;
  Skills: undefined;
  SettingsRoot: undefined;
  VoiceSettings: undefined;
  CloudStorageSettings: undefined;
  Capture: undefined;
  Contacts: undefined;
  ContactDetail: { contactId: string };
  LocationSettings: undefined;
  SearchSettings: undefined;
  FinancialDashboard: undefined;
  HealthDashboard: undefined;
  PrivacyDashboard: undefined;
  LivingWill: undefined;
  Witness: { attestationId?: string };
  Inheritance: undefined;
  InheritanceActivation: undefined;
  Network: undefined;
  BiometricSetup: undefined;
  Backup: undefined;
  AdversarialDashboard: undefined;
  AlterEgoWeek: undefined;
  TunnelPairing: undefined;
  Channels: undefined;
  Sessions: undefined;
  LearnedPreferences: undefined;
  BinaryAllowlist: undefined;
  KnowledgeGraph: undefined;
  NetworkMonitor: undefined;
  Relationships: undefined;
};

/** Legacy aliases kept for tests and nested imports */
export type ChatStackParamList = AskStackParamList;
export type BriefStackParamList = TodayStackParamList;
export type KnowledgeStackParamList = VaultStackParamList;
export type DashboardsStackParamList = WorkStackParamList;
export type SettingsStackParamList = CapabilitiesStackParamList;
export type InboxStackParamList = {
  Inbox: undefined;
};

/** Root stack navigator param list */
export type RootStackParamList = {
  Onboarding: undefined;
  Main: undefined;
};

/** Tab icon names for each tab */
export const TAB_ICONS: Record<keyof TabParamList, string> = {
  TodayTab: 'sunrise',
  AskTab: 'chat',
  WorkTab: 'briefcase',
  VaultTab: 'vault',
  ProofTab: 'shield',
  CapabilitiesTab: 'grid',
};

/** Human-readable tab labels */
export const TAB_LABELS: Record<keyof TabParamList, string> = {
  TodayTab: 'Today',
  AskTab: 'Ask',
  WorkTab: 'Work',
  VaultTab: 'Vault',
  ProofTab: 'Proof',
  CapabilitiesTab: 'Capabilities',
};
