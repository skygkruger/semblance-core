import { useState, useEffect, useCallback } from 'react';
import './UpdateChecker.css';

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
    <div className="update-banner">
      <div className="update-banner__inner">
        {state.status === 'available' && (
          <>
            <span className="update-banner__text">
              Semblance {state.version} available
            </span>
            <button type="button" onClick={handleUpdate} className="update-banner__primary-btn">
              Update
            </button>
            <button type="button" onClick={handleDismiss} className="update-banner__ghost-btn">
              Dismiss
            </button>
          </>
        )}

        {state.status === 'downloading' && (
          <>
            <span className="update-banner__text">Downloading update...</span>
            <div className="update-banner__progress-track">
              <div
                className="update-banner__progress-fill"
                style={{ width: `${state.progress ?? 0}%` }}
              />
            </div>
            <span className="update-banner__percent">{state.progress ?? 0}%</span>
          </>
        )}

        {state.status === 'ready' && (
          <>
            <span className="update-banner__text">Update ready. Restart to apply.</span>
            <button type="button" onClick={handleRelaunch} className="update-banner__primary-btn">
              Restart Now
            </button>
            <button type="button" onClick={handleDismiss} className="update-banner__ghost-btn">
              Later
            </button>
          </>
        )}

        {state.status === 'error' && (
          <>
            <span className="update-banner__error">Update failed: {state.error}</span>
            <button type="button" onClick={handleDismiss} className="update-banner__ghost-btn">
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}
