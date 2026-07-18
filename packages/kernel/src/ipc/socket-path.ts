import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform, userInfo } from 'node:os';

/**
 * Default Unix domain socket or Windows named pipe path for the sovereignty kernel.
 */
export function getDefaultKernelSocketPath(): string {
  if (platform() === 'win32') {
    const uid = userInfo().uid;
    const userSuffix = uid >= 0 ? `-${uid}` : `-${userInfo().username}`;
    return `\\\\.\\pipe\\semblance-kernel${userSuffix}-${process.pid}`;
  }

  const dir = join(homedir(), '.semblance');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, 'kernel.sock');
}
