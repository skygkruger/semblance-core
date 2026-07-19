import type { ExtensionMigrationPolicyV1 } from './manifest-v1.js';

export type ExtensionUninstallPolicyV1 = ExtensionMigrationPolicyV1['uninstall'];

export interface ExtensionMigrationStateV1 {
  schemaVersion: number;
  extensionId: string;
  dataDir: string;
}

export interface ExtensionMigrationClient {
  getState(): ExtensionMigrationStateV1;
  getDeclaredPolicy(): ExtensionMigrationPolicyV1;
  runUpgrade(fromVersion: number, toVersion: number): Promise<void>;
  prepareUninstall(): Promise<{ policy: ExtensionUninstallPolicyV1 }>;
}
