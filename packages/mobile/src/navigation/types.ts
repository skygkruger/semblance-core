// Navigation Types — Type-safe navigation for the mobile app.
// Bottom tabs: Chat, Inbox, Brief, Knowledge, Settings (matching Storybook MobileTabBar).
// Per-tab stack navigators for detail screens.
// All screens from desktop are reachable via nested stacks.

/** Bottom tab navigator param list */
export type TabParamList = {
  ChatTab: undefined;
  InboxTab: undefined;
  BriefTab: undefined;
  KnowledgeTab: undefined;
  SettingsTab: undefined;
};

/** Chat tab stack */
export type ChatStackParamList = {
  Chat: undefined;
};

/** Inbox tab stack */
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
};

/** Root stack navigator param list */
export type RootStackParamList = {
  Onboarding: undefined;
  Main: undefined;
};

/** Tab icon names for each tab */
export const TAB_ICONS: Record<keyof TabParamList, string> = {
  ChatTab: 'chat',
  InboxTab: 'inbox',
  BriefTab: 'sunrise',
  KnowledgeTab: 'brain',
  SettingsTab: 'settings',
};
