// Mock @notifee/react-native for vitest environment.
const notifee = {
  createTriggerNotification: async () => {},
  cancelNotification: async () => {},
  cancelAllNotifications: async () => {},
  requestPermission: async () => ({ authorizationStatus: 1 }),
  getNotificationSettings: async () => ({ authorizationStatus: 1 }),
  createChannel: async () => '',
};

export const TriggerType = {
  TIMESTAMP: 0,
  INTERVAL: 1,
};

export default notifee;
