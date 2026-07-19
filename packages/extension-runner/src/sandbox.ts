import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export class SandboxViolationError extends Error {
  readonly kind: string;

  constructor(kind: string, detail: string) {
    super(`Sandbox violation (${kind}): ${detail}`);
    this.name = 'SandboxViolationError';
    this.kind = kind;
  }
}

export interface ExtensionSandboxOptions {
  allowedWritePaths: string[];
}

export interface ExtensionSandbox {
  run<T>(fn: () => T | Promise<T>): Promise<T>;
  assertFetchBlocked(): void;
  assertWriteOutsideAllowlistBlocked(allowedPath: string): void;
  assertSecretEnvBlocked(): void;
}

const SECRET_ENV_PATTERN =
  /(?:SECRET|TOKEN|PRIVATE|PASSWORD|API[_-]?KEY|LICENSE|CREDENTIAL|sem_)/i;

function normalizePath(path: string): string {
  return resolve(path);
}

function isPathAllowed(targetPath: string, allowedWritePaths: string[]): boolean {
  const normalized = normalizePath(targetPath);
  return allowedWritePaths.some((allowed) => {
    const allowedNormalized = normalizePath(allowed);
    return normalized === allowedNormalized || normalized.startsWith(`${allowedNormalized}/`);
  });
}

function guardWritePath(
  targetPath: string,
  allowedWritePaths: string[],
  operation: string,
): void {
  if (!isPathAllowed(targetPath, allowedWritePaths)) {
    throw new SandboxViolationError('fs-write', `${operation} blocked for ${targetPath}`);
  }
}

type FetchFn = typeof globalThis.fetch;

interface SandboxState {
  originalFetch: FetchFn | undefined;
  originalEnv: NodeJS.ProcessEnv;
  patched: boolean;
}

export function createExtensionSandbox(options: ExtensionSandboxOptions): ExtensionSandbox {
  const allowedWritePaths = options.allowedWritePaths.map(normalizePath);
  const state: SandboxState = {
    originalFetch: globalThis.fetch,
    originalEnv: process.env,
    patched: false,
  };

  const writeMethods: Array<keyof typeof fs> = [
    'writeFileSync',
    'appendFileSync',
    'mkdirSync',
    'rmSync',
    'renameSync',
    'copyFileSync',
  ];

  const originalSyncMethods = new Map<string, (...args: unknown[]) => unknown>();
  const originalPromiseMethods = new Map<string, (...args: unknown[]) => unknown>();

  function patchFs(): void {
    for (const method of writeMethods) {
      const original = fs[method] as (...args: unknown[]) => unknown;
      originalSyncMethods.set(String(method), original);
      (fs as Record<string, unknown>)[method as string] = (...args: unknown[]) => {
        const targetPath = args[0];
        if (typeof targetPath === 'string') {
          guardWritePath(targetPath, allowedWritePaths, String(method));
        }
        return (original as (...inner: unknown[]) => unknown).apply(fs, args);
      };
    }

    for (const method of ['writeFile', 'appendFile', 'mkdir', 'rm', 'rename', 'copyFile'] as const) {
      const original = fsPromises[method].bind(fsPromises) as (...args: unknown[]) => unknown;
      originalPromiseMethods.set(method, original);
      (fsPromises as Record<string, unknown>)[method] = async (...args: unknown[]) => {
        const targetPath = args[0];
        if (typeof targetPath === 'string') {
          guardWritePath(targetPath, allowedWritePaths, `fs.promises.${method}`);
        }
        return (original as (...inner: unknown[]) => unknown).apply(fsPromises, args);
      };
    }
  }

  function restoreFs(): void {
    for (const [method, original] of originalSyncMethods.entries()) {
      (fs as Record<string, unknown>)[method] = original;
    }
    for (const [method, original] of originalPromiseMethods.entries()) {
      (fsPromises as Record<string, unknown>)[method] = original;
    }
    originalSyncMethods.clear();
    originalPromiseMethods.clear();
  }

  function patchFetch(): void {
    const blockedFetch: FetchFn = ((..._args: Parameters<FetchFn>) => {
      throw new SandboxViolationError('network', 'fetch is denied in extension sandbox');
    }) as FetchFn;
    globalThis.fetch = blockedFetch;
  }

  function restoreFetch(): void {
    if (state.originalFetch) {
      globalThis.fetch = state.originalFetch;
    } else {
      delete (globalThis as { fetch?: FetchFn }).fetch;
    }
  }

  function patchEnv(): void {
    process.env = new Proxy(state.originalEnv, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && SECRET_ENV_PATTERN.test(prop)) {
          throw new SandboxViolationError('secret-env', `Reading ${prop} is denied`);
        }
        return Reflect.get(target, prop, receiver);
      },
      set(target, prop, value, receiver) {
        if (typeof prop === 'string' && SECRET_ENV_PATTERN.test(prop)) {
          throw new SandboxViolationError('secret-env', `Writing ${prop} is denied`);
        }
        return Reflect.set(target, prop, value, receiver);
      },
    });
  }

  function restoreEnv(): void {
    process.env = state.originalEnv;
  }

  function activate(): void {
    if (state.patched) return;
    patchFetch();
    patchFs();
    patchEnv();
    state.patched = true;
  }

  function deactivate(): void {
    if (!state.patched) return;
    restoreFetch();
    restoreFs();
    restoreEnv();
    state.patched = false;
  }

  return {
    async run<T>(fn: () => T | Promise<T>): Promise<T> {
      activate();
      try {
        return await fn();
      } finally {
        deactivate();
      }
    },
    assertFetchBlocked(): void {
      activate();
      try {
        expectBlocked(() => {
          void globalThis.fetch('https://example.com');
        }, 'network');
      } finally {
        deactivate();
      }
    },
    assertWriteOutsideAllowlistBlocked(allowedPath: string): void {
      activate();
      try {
        expectBlocked(() => {
          fs.writeFileSync(resolve(dirname(allowedPath), 'blocked-write.txt'), 'blocked');
        }, 'fs-write');
      } finally {
        deactivate();
      }
    },
    assertSecretEnvBlocked(): void {
      activate();
      try {
        expectBlocked(() => {
          void process.env.SEMBLANCE_LICENSE_KEY;
        }, 'secret-env');
      } finally {
        deactivate();
      }
    },
  };
}

function expectBlocked(fn: () => void, kind: string): void {
  try {
    fn();
    throw new Error(`Expected sandbox to block ${kind}`);
  } catch (error) {
    if (error instanceof SandboxViolationError) {
      if (error.kind !== kind) {
        throw new Error(`Expected ${kind} violation, got ${error.kind}`);
      }
      return;
    }
    throw error;
  }
}

export function ensureParentDir(filePath: string): void {
  fs.mkdirSync(dirname(filePath), { recursive: true });
}
