// Mock react-native-device-info for vitest environment.
const DeviceInfo = {
  getTotalMemory: async () => 6 * 1024 * 1024 * 1024,
  getDeviceName: async () => 'Mock Device',
  getSupportedAbis: async () => ['arm64-v8a'],
  getSystemVersion: async () => '17.0',
  getModel: () => 'MockPhone',
  getBrand: () => 'MockBrand',
  getUniqueId: async () => 'mock-unique-id',
  isEmulator: async () => true,
};

export default DeviceInfo;
