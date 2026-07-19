export interface ShutdownHook {
  name: string;
  run: () => Promise<void> | void;
}

let registeredHooks: ShutdownHook[] = [];
let shuttingDown = false;

export function registerShutdownHook(hook: ShutdownHook): void {
  registeredHooks.push(hook);
}

export function registerGracefulShutdown(onSignal: (signal: string) => Promise<void>): void {
  const handler = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    void (async () => {
      try {
        await onSignal(signal);
        for (const hook of [...registeredHooks].reverse()) {
          try {
            await hook.run();
          } catch (error) {
            console.error(`[runtime-shutdown] Hook "${hook.name}" failed:`, error);
          }
        }
      } finally {
        process.exit(0);
      }
    })();
  };

  process.on('SIGTERM', () => handler('SIGTERM'));
  process.on('SIGINT', () => handler('SIGINT'));
}
