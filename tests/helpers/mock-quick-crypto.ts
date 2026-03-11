// Mock react-native-quick-crypto for vitest environment.
// Delegates to Node.js crypto for test compatibility.
import * as nodeCrypto from 'node:crypto';

export function createHash(algorithm: string) {
  return nodeCrypto.createHash(algorithm);
}

export function createHmac(algorithm: string, key: unknown) {
  return nodeCrypto.createHmac(algorithm, key as string);
}

export function randomBytes(size: number) {
  return nodeCrypto.randomBytes(size);
}

export function createCipheriv(algorithm: string, key: unknown, iv: unknown) {
  return nodeCrypto.createCipheriv(algorithm as string, key as Buffer, iv as Buffer);
}

export function createDecipheriv(algorithm: string, key: unknown, iv: unknown) {
  return nodeCrypto.createDecipheriv(algorithm as string, key as Buffer, iv as Buffer);
}

export function timingSafeEqual(a: Buffer, b: Buffer) {
  return nodeCrypto.timingSafeEqual(a, b);
}
