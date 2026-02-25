// Mobile Backup Adapter — React Native adapter for backup destination management.
//
// Lists available backup destinations on mobile:
//   - App documents directory (always available)
//   - External storage (SD card on Android, connected drives via Files.app on iOS)
//
// CRITICAL: No network imports. No cloud backup destinations. Local only.

/**
 * Represents a storage destination available for backups.
 */
export interface BackupDestination {
  id: string;
  label: string;
  path: string;
  type: 'app-documents' | 'external-storage';
  availableBytes: number | null;
  isDefault: boolean;
}

/**
 * Shape of react-native-fs module (subset needed for backup).
 */
interface RNFSModule {
  DocumentDirectoryPath: string;
  ExternalStorageDirectoryPath?: string;
  ExternalDirectoryPath?: string;
  getFSInfo(): Promise<{
    totalSpace: number;
    freeSpace: number;
  }>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
}

/**
 * Create the mobile backup adapter.
 */
export function createMobileBackupAdapter(platform: 'ios' | 'android'): {
  getAvailableDestinations: () => Promise<BackupDestination[]>;
  ensureDestination: (path: string) => Promise<boolean>;
} {
  let rnfs: RNFSModule | null = null;

  function getRNFS(): RNFSModule | null {
    if (!rnfs) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        rnfs = require('react-native-fs').default ?? require('react-native-fs');
      } catch {
        return null;
      }
    }
    return rnfs;
  }

  return {
    async getAvailableDestinations(): Promise<BackupDestination[]> {
      const fs = getRNFS();
      const destinations: BackupDestination[] = [];

      // App documents directory is always available
      const docPath = fs?.DocumentDirectoryPath ?? '/data/app-documents';
      const backupDir = `${docPath}/backups`;

      let freeSpace: number | null = null;
      if (fs) {
        try {
          const info = await fs.getFSInfo();
          freeSpace = info.freeSpace;
        } catch {
          freeSpace = null;
        }
      }

      destinations.push({
        id: 'app-documents',
        label: 'App Storage',
        path: backupDir,
        type: 'app-documents',
        availableBytes: freeSpace,
        isDefault: true,
      });

      // External storage — Android only (SD card / external directory)
      if (platform === 'android' && fs) {
        const extPath = fs.ExternalStorageDirectoryPath ?? fs.ExternalDirectoryPath;
        if (extPath) {
          try {
            const extBackupDir = `${extPath}/Semblance/backups`;
            const exists = await fs.exists(extPath);
            if (exists) {
              destinations.push({
                id: 'external-storage',
                label: 'External Storage',
                path: extBackupDir,
                type: 'external-storage',
                availableBytes: null,
                isDefault: false,
              });
            }
          } catch {
            // External storage not accessible — skip
          }
        }
      }

      // iOS: External drives are accessed via document picker, not direct paths.
      // The share adapter's pickFile() handles Files.app integration for import.
      // For iOS backup export, the share sheet sends the .sbk file to the user's
      // chosen destination (iCloud Drive, USB drive, AirDrop, etc.).

      return destinations;
    },

    async ensureDestination(path: string): Promise<boolean> {
      const fs = getRNFS();
      if (!fs) return false;

      try {
        const exists = await fs.exists(path);
        if (!exists) {
          await fs.mkdir(path);
        }
        return true;
      } catch {
        return false;
      }
    },
  };
}
