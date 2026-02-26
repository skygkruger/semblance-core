import { useState, useEffect, useCallback } from 'react';

interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'dismissed';
  version?: string;
  progress?: number;
  error?: string;
}

// Dynamic imports for Tauri updater plugin — these resolve at runtime when
// the plugin is installed and configured. Using dynamic imports avoids
// hard compile-time dependency on @tauri-apps/plugin-updater types.
interface UpdateResult {
  version: string;
  downloadAndInstall: (onEvent: (event: DownloadEvent) => void) => Promise<void>;
}

interface DownloadEvent {
  event: 'Started' | 'Progress' | 'Finished';
  data: { contentLength?: number; chunkLength: number };
}

async function checkForUpdates(): Promise<UpdateResult | null> {
  try {
    const mod = await import('@tauri-apps/plugin-updater' as string);
    return mod.check();
  } catch {
    return null;
  }
}

async function relaunchApp(): Promise<void> {
  try {
    const mod = await import('@tauri-apps/plugin-shell' as string);
    if (typeof mod.relaunch === 'function') {
      await mod.relaunch();
    }
  } catch {
    // If plugin-shell doesn't export relaunch, try process module
    try {
      const proc = await import('@tauri-apps/api/process' as string);
      if (typeof proc.relaunch === 'function') {
        await proc.relaunch();
      }
    } catch {
      // Relaunch not available — user will need to restart manually
    }
  }
}

export function UpdateChecker() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });

  const doCheck = useCallback(async () => {
    setState({ status: 'checking' });
    try {
      const update = await checkForUpdates();
      if (update) {
        setState({ status: 'available', version: update.version });
      } else {
        setState({ status: 'idle' });
      }
    } catch {
      setState({ status: 'idle' });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(doCheck, 3000);
    return () => clearTimeout(timer);
  }, [doCheck]);

  const handleUpdate = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'downloading', progress: 0 }));
    try {
      const update = await checkForUpdates();
      if (!update) {
        setState({ status: 'idle' });
        return;
      }

      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event: DownloadEvent) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setState((prev) => ({
                ...prev,
                progress: Math.round((downloaded / contentLength) * 100),
              }));
            }
            break;
          case 'Finished':
            setState((prev) => ({ ...prev, status: 'ready' }));
            break;
        }
      });
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof Error ? err.message : 'Update failed',
      });
    }
  }, []);

  const handleRelaunch = useCallback(async () => {
    await relaunchApp();
  }, []);

  const handleDismiss = useCallback(() => {
    setState({ status: 'dismissed' });
  }, []);

  if (state.status === 'idle' || state.status === 'checking' || state.status === 'dismissed') {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center px-4 py-2 bg-semblance-primary/10 dark:bg-semblance-primary/15 border-b border-semblance-primary/20 backdrop-blur-sm">
      <div className="flex items-center gap-3 text-sm">
        {state.status === 'available' && (
          <>
            <span className="text-semblance-text-primary dark:text-semblance-text-primary-dark">
              Semblance {state.version} available
            </span>
            <button
              type="button"
              onClick={handleUpdate}
              className="px-3 py-1 text-xs font-medium rounded-md bg-semblance-primary text-white hover:bg-semblance-primary/90 transition-colors"
            >
              Update
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="px-2 py-1 text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:text-semblance-text-primary dark:hover:text-semblance-text-primary-dark transition-colors"
            >
              Dismiss
            </button>
          </>
        )}

        {state.status === 'downloading' && (
          <>
            <span className="text-semblance-text-primary dark:text-semblance-text-primary-dark">
              Downloading update...
            </span>
            <div className="w-32 h-1.5 bg-semblance-surface-2 dark:bg-semblance-surface-2-dark rounded-full overflow-hidden">
              <div
                className="h-full bg-semblance-primary rounded-full transition-all duration-300"
                style={{ width: `${state.progress ?? 0}%` }}
              />
            </div>
            <span className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
              {state.progress ?? 0}%
            </span>
          </>
        )}

        {state.status === 'ready' && (
          <>
            <span className="text-semblance-text-primary dark:text-semblance-text-primary-dark">
              Update ready. Restart to apply.
            </span>
            <button
              type="button"
              onClick={handleRelaunch}
              className="px-3 py-1 text-xs font-medium rounded-md bg-semblance-primary text-white hover:bg-semblance-primary/90 transition-colors"
            >
              Restart Now
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="px-2 py-1 text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:text-semblance-text-primary dark:hover:text-semblance-text-primary-dark transition-colors"
            >
              Later
            </button>
          </>
        )}

        {state.status === 'error' && (
          <>
            <span className="text-red-400">Update failed: {state.error}</span>
            <button
              type="button"
              onClick={handleDismiss}
              className="px-2 py-1 text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:text-semblance-text-primary dark:hover:text-semblance-text-primary-dark transition-colors"
            >
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}
