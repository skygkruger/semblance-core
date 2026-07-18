import {
  chmodSync,
  copyFileSync,
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import type { ReservationMigrationPlatformAdapter } from '../../../core/premium/migrations/reservation-entitlement-split.js';

/**
 * Desktop-only filesystem and hashing capabilities for the reservation split.
 * Core receives this narrow adapter and remains independent of Node builtins.
 */
export const nodeReservationMigrationAdapter: ReservationMigrationPlatformAdapter = {
  platform: process.platform === 'win32' ? 'win32' : 'posix',
  exists: existsSync,
  readText: (path) => readFileSync(path, 'utf8'),
  writePrivateText: (path, content) => writeFileSync(path, content, { mode: 0o600 }),
  restrictToOwner: (path) => {
    if (process.platform !== 'win32') chmodSync(path, 0o600);
  },
  remove: unlinkSync,
  copy: copyFileSync,
  sha256: (data) => createHash('sha256').update(data, 'utf8').digest('hex'),
  sha256File: (path) => createHash('sha256').update(readFileSync(path)).digest('hex'),
};
