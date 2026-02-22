// Tests for AutonomyManager — tier logic, domain mapping, approval decisions.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { AutonomyManager } from '@semblance/core/agent/autonomy.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';

describe('AutonomyManager', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('Guardian mode', () => {
    it('requires approval for all actions', () => {
      const manager = new AutonomyManager(db as unknown as DatabaseHandle, { defaultTier: 'guardian', domainOverrides: {} });

      expect(manager.decide('email.fetch')).toBe('requires_approval');
      expect(manager.decide('email.send')).toBe('requires_approval');
      expect(manager.decide('calendar.fetch')).toBe('requires_approval');
      expect(manager.decide('calendar.create')).toBe('requires_approval');
      expect(manager.decide('finance.fetch_transactions')).toBe('requires_approval');
      expect(manager.decide('health.fetch')).toBe('requires_approval');
      expect(manager.decide('service.api_call')).toBe('requires_approval');
    });
  });

  describe('Partner mode', () => {
    it('auto-approves read actions', () => {
      const manager = new AutonomyManager(db as unknown as DatabaseHandle, { defaultTier: 'partner', domainOverrides: {} });

      expect(manager.decide('email.fetch')).toBe('auto_approve');
      expect(manager.decide('calendar.fetch')).toBe('auto_approve');
      expect(manager.decide('finance.fetch_transactions')).toBe('auto_approve');
      expect(manager.decide('health.fetch')).toBe('auto_approve');
    });

    it('auto-approves write actions', () => {
      const manager = new AutonomyManager(db as unknown as DatabaseHandle, { defaultTier: 'partner', domainOverrides: {} });

      expect(manager.decide('email.draft')).toBe('auto_approve');
      expect(manager.decide('calendar.create')).toBe('auto_approve');
      expect(manager.decide('calendar.update')).toBe('auto_approve');
    });

    it('requires approval for execute actions', () => {
      const manager = new AutonomyManager(db as unknown as DatabaseHandle, { defaultTier: 'partner', domainOverrides: {} });

      expect(manager.decide('email.send')).toBe('requires_approval');
      expect(manager.decide('service.api_call')).toBe('requires_approval');
    });
  });

  describe('Alter Ego mode', () => {
    it('auto-approves most actions', () => {
      const manager = new AutonomyManager(db as unknown as DatabaseHandle, { defaultTier: 'alter_ego', domainOverrides: {} });

      expect(manager.decide('email.fetch')).toBe('auto_approve');
      expect(manager.decide('email.draft')).toBe('auto_approve');
      expect(manager.decide('calendar.fetch')).toBe('auto_approve');
      expect(manager.decide('calendar.create')).toBe('auto_approve');
      expect(manager.decide('service.api_call')).toBe('auto_approve');
    });

    it('still requires approval for email.send', () => {
      const manager = new AutonomyManager(db as unknown as DatabaseHandle, { defaultTier: 'alter_ego', domainOverrides: {} });

      expect(manager.decide('email.send')).toBe('requires_approval');
    });
  });

  describe('domain overrides', () => {
    it('applies per-domain tier override', () => {
      const manager = new AutonomyManager(db as unknown as DatabaseHandle, {
        defaultTier: 'partner',
        domainOverrides: { email: 'guardian' },
      });

      // Email actions use guardian (require approval even for reads)
      expect(manager.decide('email.fetch')).toBe('requires_approval');

      // Calendar still uses partner (auto-approve reads)
      expect(manager.decide('calendar.fetch')).toBe('auto_approve');
    });

    it('can set domain tier at runtime', () => {
      const manager = new AutonomyManager(db as unknown as DatabaseHandle, { defaultTier: 'partner', domainOverrides: {} });

      // Initially partner
      expect(manager.decide('email.fetch')).toBe('auto_approve');

      // Override to guardian
      manager.setDomainTier('email', 'guardian');
      expect(manager.decide('email.fetch')).toBe('requires_approval');
    });
  });

  describe('getDomainForAction', () => {
    it('maps actions to correct domains', () => {
      const manager = new AutonomyManager(db as unknown as DatabaseHandle);

      expect(manager.getDomainForAction('email.fetch')).toBe('email');
      expect(manager.getDomainForAction('email.send')).toBe('email');
      expect(manager.getDomainForAction('calendar.fetch')).toBe('calendar');
      expect(manager.getDomainForAction('calendar.create')).toBe('calendar');
      expect(manager.getDomainForAction('finance.fetch_transactions')).toBe('finances');
      expect(manager.getDomainForAction('health.fetch')).toBe('health');
      expect(manager.getDomainForAction('service.api_call')).toBe('services');
    });
  });

  describe('getConfig', () => {
    it('returns all domain tiers', () => {
      const manager = new AutonomyManager(db as unknown as DatabaseHandle, { defaultTier: 'partner', domainOverrides: {} });

      const config = manager.getConfig();
      expect(config.email).toBe('partner');
      expect(config.calendar).toBe('partner');
      expect(config.finances).toBe('partner');
      expect(config.health).toBe('partner');
      expect(config.files).toBe('partner');
      expect(config.services).toBe('partner');
    });
  });

  describe('preference sync callback', () => {
    it('setDomainTier triggers onPreferenceChanged callback', () => {
      const callback = vi.fn();
      const manager = new AutonomyManager(db as unknown as DatabaseHandle, {
        defaultTier: 'partner',
        domainOverrides: {},
        onPreferenceChanged: callback,
      });

      manager.setDomainTier('email', 'alter_ego');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('email', 'alter_ego');
    });

    it('setDomainTier works without callback configured', () => {
      const manager = new AutonomyManager(db as unknown as DatabaseHandle, {
        defaultTier: 'partner',
        domainOverrides: {},
      });

      // Should not throw
      manager.setDomainTier('email', 'guardian');
      expect(manager.getDomainTier('email')).toBe('guardian');
    });
  });
});
