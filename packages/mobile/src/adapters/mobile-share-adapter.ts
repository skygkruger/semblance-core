// Mobile Share Adapter — React Native adapter for system share sheet and document picker.
//
// shareFile: Opens platform share sheet with a file.
// pickFile: Opens document picker for file selection.
//
// CRITICAL: No network imports. Share sheet and picker are local OS operations.

/**
 * Result of a share or pick operation.
 */
export interface ShareResult {
  status: 'success' | 'cancelled' | 'error';
  error?: string;
}

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PickResult {
  status: 'success' | 'cancelled' | 'error';
  file?: PickedFile;
  error?: string;
}

/**
 * Shape of react-native-share module.
 */
interface RNShareModule {
  open(options: {
    url: string;
    type: string;
    title?: string;
    message?: string;
  }): Promise<{ success: boolean }>;
}

/**
 * Shape of react-native-document-picker module.
 */
interface RNDocumentPickerModule {
  pickSingle(options?: {
    type?: string[];
    copyTo?: 'cachesDirectory' | 'documentDirectory';
  }): Promise<{
    uri: string;
    name: string;
    type: string;
    size: number;
  }>;
  isCancel(err: unknown): boolean;
}

/**
 * Create the React Native share adapter.
 */
export function createMobileShareAdapter(): {
  shareFile: (path: string, mimeType: string, title?: string) => Promise<ShareResult>;
  pickFile: (types?: string[]) => Promise<PickResult>;
} {
  let share: RNShareModule | null = null;
  let picker: RNDocumentPickerModule | null = null;

  function getShare(): RNShareModule | null {
    if (!share) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        share = require('react-native-share').default;
      } catch {
        return null;
      }
    }
    return share;
  }

  function getPicker(): RNDocumentPickerModule | null {
    if (!picker) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        picker = require('react-native-document-picker').default;
      } catch {
        return null;
      }
    }
    return picker;
  }

  return {
    async shareFile(path: string, mimeType: string, title?: string): Promise<ShareResult> {
      const mod = getShare();
      if (!mod) {
        return { status: 'error', error: 'Share module not available' };
      }

      try {
        const fileUri = path.startsWith('file://') ? path : `file://${path}`;
        const result = await mod.open({
          url: fileUri,
          type: mimeType,
          title: title ?? 'Share file',
        });
        return result.success
          ? { status: 'success' }
          : { status: 'cancelled' };
      } catch (err) {
        // Share sheet dismissal may throw on some platforms
        const msg = err instanceof Error ? err.message : 'Unknown error';
        if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('dismiss')) {
          return { status: 'cancelled' };
        }
        return { status: 'error', error: msg };
      }
    },

    async pickFile(types?: string[]): Promise<PickResult> {
      const mod = getPicker();
      if (!mod) {
        return { status: 'error', error: 'Document picker not available' };
      }

      try {
        const result = await mod.pickSingle({
          type: types,
          copyTo: 'cachesDirectory',
        });
        return {
          status: 'success',
          file: {
            uri: result.uri,
            name: result.name,
            mimeType: result.type,
            sizeBytes: result.size,
          },
        };
      } catch (err) {
        if (mod.isCancel(err)) {
          return { status: 'cancelled' };
        }
        return {
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    },
  };
}
