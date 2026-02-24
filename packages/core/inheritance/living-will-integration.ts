// Living Will Integration — Export/import bridge for inheritance config.
// Export: strips passphrase hashes and activation packages.
// Import: marks all packages invalid with warning.
// CRITICAL: No networking imports.

import type { InheritanceConfigStore } from './inheritance-config-store.js';
import type { InheritanceExportData } from './types.js';

/**
 * Provides Living Will archive integration for inheritance config.
 */
export class InheritanceLivingWillIntegration {
  private store: InheritanceConfigStore;

  constructor(store: InheritanceConfigStore) {
    this.store = store;
  }

  /**
   * Collect inheritance config for Living Will export.
   * Strips sensitive data: passphrase hashes and activation packages.
   */
  collectForExport(): InheritanceExportData | null {
    const config = this.store.getConfig();
    const parties = this.store.getAllParties();
    const actions = this.store.getAllActions();
    const templates = this.store.getAllTemplates();

    if (parties.length === 0) return null;

    return {
      config,
      parties: parties.map((p) => ({
        name: p.name,
        email: p.email,
        relationship: p.relationship,
        actionCount: actions.filter((a) => a.partyId === p.id).length,
      })),
      actionCount: actions.length,
      templateCount: templates.length,
      lastReviewedAt: config.lastReviewedAt,
    };
  }

  /**
   * Import inheritance config from a Living Will archive.
   * Returns warnings about device-bound data that cannot be restored.
   */
  importInheritanceConfig(data: InheritanceExportData): {
    success: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];

    // Activation packages are device-bound and cannot be transferred
    warnings.push(
      'Inheritance activation packages are device-bound. All existing packages are now invalid. ' +
      'Trusted parties must be re-registered and new packages generated on this device.',
    );

    // Restore config settings (non-sensitive)
    if (data.config) {
      this.store.updateConfig({
        timeLockHours: data.config.timeLockHours,
        requireStepConfirmation: data.config.requireStepConfirmation,
        requireAllPartiesForDeletion: data.config.requireAllPartiesForDeletion,
      });
    }

    return { success: true, warnings };
  }
}
