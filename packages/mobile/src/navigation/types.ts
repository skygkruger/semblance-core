// Navigation Types — Type-safe navigation for the mobile app.
// Bottom tabs: Chat, Brief, Knowledge, Privacy, Settings.
// Per-tab stack navigators for detail screens.

/** Bottom tab navigator param list */
export type TabParamList = {
  ChatTab: undefined;
  BriefTab: undefined;
  KnowledgeTab: undefined;
  PrivacyTab: undefined;
  SettingsTab: undefined;
};

/** Chat tab stack */
export type ChatStackParamList = {
  Chat: undefined;
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

/** Privacy tab stack */
export type PrivacyStackParamList = {
  PrivacyDashboard: undefined;
};

/** Settings tab stack — screens with no required props registered directly.
 *  Screens with complex required props (sovereignty, security, financial, contacts, location)
 *  will be wired with container wrappers in Sprint 5. */
export type SettingsStackParamList = {
  SettingsRoot: undefined;
  VoiceSettings: undefined;
  CloudStorageSettings: undefined;
  Capture: undefined;
  ImportDigitalLife: undefined;
  // Sprint 5 additions (require container wrappers with real data):
  // Contacts: undefined;
  // ContactDetail: { contactId: string };
  // LocationSettings: undefined;
  // FinancialDashboard: undefined;
  // LivingWill: undefined;
  // Witness: { attestationId?: string };
  // Inheritance: undefined;
  // InheritanceActivation: undefined;
  // Network: undefined;
  // BiometricSetup: undefined;
  // Backup: undefined;
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
  PrivacyTab: 'shield',
  SettingsTab: 'settings',
};
