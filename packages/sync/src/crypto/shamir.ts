import { randomInt } from 'node:crypto';

const FIELD_PRIME = 257;

function mod(value: number): number {
  const result = value % FIELD_PRIME;
  return result < 0 ? result + FIELD_PRIME : result;
}

function modAdd(a: number, b: number): number {
  return mod(a + b);
}

function modSub(a: number, b: number): number {
  return mod(a - b);
}

function modMul(a: number, b: number): number {
  return mod(a * b);
}

function modPow(base: number, exponent: number): number {
  let result = 1;
  let b = mod(base);
  let e = exponent;
  while (e > 0) {
    if (e & 1) {
      result = modMul(result, b);
    }
    b = modMul(b, b);
    e >>= 1;
  }
  return result;
}

function modInv(value: number): number {
  const normalized = mod(value);
  if (normalized === 0) {
    throw new Error('Cannot invert zero');
  }
  return modPow(normalized, FIELD_PRIME - 2);
}

function modDiv(a: number, b: number): number {
  return modMul(a, modInv(b));
}

function evaluatePolynomial(coefficients: number[], x: number): number {
  let result = 0;
  let xPower = 1;
  for (const coefficient of coefficients) {
    result = modAdd(result, modMul(coefficient, xPower));
    xPower = modMul(xPower, x);
  }
  return result;
}

function lagrangeInterpolateAtZero(points: Array<{ x: number; y: number }>): number {
  let result = 0;
  for (let i = 0; i < points.length; i += 1) {
    let basis = 1;
    for (let j = 0; j < points.length; j += 1) {
      if (i === j) {
        continue;
      }
      basis = modMul(basis, modDiv(modSub(0, points[j]!.x), modSub(points[i]!.x, points[j]!.x)));
    }
    result = modAdd(result, modMul(points[i]!.y, basis));
  }
  return result;
}

export interface ShamirShare {
  readonly index: number;
  readonly value: Buffer;
}

export function splitSecret(secret: Buffer, threshold: number, totalShares: number): ShamirShare[] {
  if (threshold < 1) {
    throw new Error('Recovery threshold must be at least 1');
  }
  if (totalShares < threshold) {
    throw new Error('Total shares must be >= threshold');
  }
  if (secret.length === 0) {
    throw new Error('Secret must not be empty');
  }

  const shares: ShamirShare[] = Array.from({ length: totalShares }, (_, index) => ({
    index: index + 1,
    value: Buffer.alloc(secret.length),
  }));

  for (let byteIndex = 0; byteIndex < secret.length; byteIndex += 1) {
    let coefficients: number[] = [secret[byteIndex]!];
    let encoded = false;
    while (!encoded) {
      coefficients = [secret[byteIndex]!];
      while (coefficients.length < threshold) {
        coefficients.push(randomInt(0, FIELD_PRIME));
      }
      encoded = true;
      for (let shareIndex = 1; shareIndex <= totalShares; shareIndex += 1) {
        const y = evaluatePolynomial(coefficients, shareIndex);
        if (y === 256) {
          encoded = false;
          break;
        }
        shares[shareIndex - 1]!.value[byteIndex] = y;
      }
    }
  }

  return shares;
}

export function combineShares(shares: ShamirShare[]): Buffer {
  if (shares.length === 0) {
    throw new Error('At least one share is required');
  }
  const length = shares[0]!.value.length;
  for (const share of shares) {
    if (share.value.length !== length) {
      throw new Error('All shares must have the same length');
    }
  }

  const secret = Buffer.alloc(length);
  for (let byteIndex = 0; byteIndex < length; byteIndex += 1) {
    const points = shares.map((share) => ({
      x: share.index,
      y: share.value[byteIndex]!,
    }));
    const reconstructed = lagrangeInterpolateAtZero(points);
    if (reconstructed === 256) {
      throw new Error('Recovered secret byte is out of range');
    }
    secret[byteIndex] = reconstructed;
  }
  return secret;
}

export function sharesToHex(shares: ShamirShare[]): Array<{ index: number; shareHex: string }> {
  return shares.map((share) => ({
    index: share.index,
    shareHex: share.value.toString('hex'),
  }));
}

export function sharesFromHex(entries: Array<{ index: number; shareHex: string }>): ShamirShare[] {
  return entries.map((entry) => ({
    index: entry.index,
    value: Buffer.from(entry.shareHex, 'hex'),
  }));
}
