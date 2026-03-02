// KeychainStore Interface Tests — Core keychain abstraction contracts.
//
// Covers:
// - keychainServiceName() builds correct service identifier
// - keychainOAuthServiceName() builds correct OAuth service identifier
// - MIGRATED_SENTINEL is the expected constant
// - Interface contract verification (structural)

import { describe, it, expect } from 'vitest';
import {
  keychainServiceName,
  keychainOAuthServiceName,
  MIGRATED_SENTINEL,
} from '@semblance/core/credentials/keychain';

describe('keychainServiceName', () => {
  it('builds service name with semblance.credential prefix', () => {
    expect(keychainServiceName('imap-1')).toBe('semblance.credential.imap-1');
  });

  it('builds service name for different connector IDs', () => {
    expect(keychainServiceName('caldav-work')).toBe('semblance.credential.caldav-work');
    expect(keychainServiceName('smtp-personal')).toBe('semblance.credential.smtp-personal');
  });

  it('handles empty connector ID', () => {
    expect(keychainServiceName('')).toBe('semblance.credential.');
  });
});

describe('keychainOAuthServiceName', () => {
  it('builds service name with semblance.oauth prefix', () => {
    expect(keychainOAuthServiceName('google')).toBe('semblance.oauth.google');
  });

  it('builds service name for different providers', () => {
    expect(keychainOAuthServiceName('microsoft')).toBe('semblance.oauth.microsoft');
    expect(keychainOAuthServiceName('github')).toBe('semblance.oauth.github');
  });
});

describe('MIGRATED_SENTINEL', () => {
  it('has expected value', () => {
    expect(MIGRATED_SENTINEL).toBe('MIGRATED_TO_KEYCHAIN');
  });

  it('is a string constant', () => {
    expect(typeof MIGRATED_SENTINEL).toBe('string');
  });
});
