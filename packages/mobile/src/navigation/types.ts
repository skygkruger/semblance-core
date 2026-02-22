// Navigation Types — Type-safe navigation for the mobile app.
// Bottom tabs: Inbox, Chat, Capture, Settings.
// Stack screens within each tab as needed.

/** Bottom tab navigator param list */
export type TabParamList = {
  Inbox: undefined;
  Chat: undefined;
  Capture: undefined;
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
};

/** Tab icon names for each tab */
export const TAB_ICONS: Record<keyof TabParamList, string> = {
  Inbox: 'inbox',
  Chat: 'chat',
  Capture: 'capture',
  Settings: 'settings',
};
