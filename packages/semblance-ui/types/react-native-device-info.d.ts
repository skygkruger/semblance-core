// Ambient type declarations for react-native-device-info
// These types cover the API surface used by packages/mobile/src/runtime/platform-adapters.ts

declare module 'react-native-device-info' {
  interface DeviceInfoModule {
    getModel(): string;
    getSystemName(): string;
    getSystemVersion(): string;
    getUniqueId(): Promise<string>;
    getTotalMemory(): Promise<number>;
    supportedAbis(): Promise<string[]>;
    getDeviceName(): Promise<string>;
    getBrand(): string;
  }

  const DeviceInfo: DeviceInfoModule;
  export default DeviceInfo;
}
