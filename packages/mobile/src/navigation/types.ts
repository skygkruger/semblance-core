// Navigation Types — Type-safe navigation for the mobile app.
// Bottom tabs: Chat, Brief, Knowledge, Dashboards, Settings.
// Per-tab stack navigators for detail screens.
// All screens from desktop are reachable via nested stacks.

/** Bottom tab navigator param list */
export type TabParamList = {
  ChatTab: undefined;
  BriefTab: undefined;
  KnowledgeTab: undefined;
  DashboardsTab: undefined;
  SettingsTab: undefined;
};

/** Chat tab stack */
export type ChatStackParamList = {
  Chat: undefined;
};

/** Inbox tab stack (kept for backward compat) */
export type InboxStackParamList = {
  Inbox: undefined;
};

/** Brief tab stack */
export type BriefStackParamList = {
  Brief: undefined;
};

/** Knowledge tab stack */
export type KnowledgeStackParamList = {
  KnowledgeGraph: undefined;
  ImportDigitalLife: undefined;
};

/** Dashboards tab stack — hub + sub-dashboards */
export type DashboardsStackParamList = {
  DashboardHub: undefined;
  Inbox: undefined;
  FinancialDashboard: undefined;
  HealthDashboard: undefined;
  Contacts: undefined;
  ContactDetail: { contactId: string };
  Activity: undefined;
  Digest: undefined;
  Relationships: undefined;
  SovereigntyReport: undefined;
  NetworkMonitor: undefined;
};

/** Settings tab stack — all secondary screens nest here */
export type SettingsStackParamList = {
  SettingsRoot: undefined;
  VoiceSettings: undefined;
  CloudStorageSettings: undefined;
  Capture: undefined;
  ImportDigitalLife: undefined;
  Contacts: undefined;
  ContactDetail: { contactId: string };
  LocationSettings: undefined;
  SearchSettings: undefined;
  FinancialDashboard: undefined;
  HealthDashboard: undefined;
  PrivacyDashboard: undefined;
  ProofOfPrivacy: undefined;
  LivingWill: undefined;
  Witness: { attestationId?: string };
  Inheritance: undefined;
  InheritanceActivation: undefined;
  Network: undefined;
  BiometricSetup: undefined;
  Backup: undefined;
  AdversarialDashboard: undefined;
  Connections: undefined;
  Files: undefined;
  Activity: undefined;
  Intent: undefined;
  Digest: undefined;
  NetworkMonitor: undefined;
  Relationships: undefined;
  SovereigntyReport: undefined;
};

/** Root stack navigator param list */
export type RootStackParamList = {
  Onboarding: undefined;
  Main: undefined;
};

/** Tab icon names for each tab */
export const TAB_ICONS: Record<keyof TabParamList, string> = {
  ChatTab: 'chat',
  BriefTab: 'sunrise',
  KnowledgeTab: 'brain',
  DashboardsTab: 'grid',
  SettingsTab: 'settings',
};
