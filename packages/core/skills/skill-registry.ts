// Sovereign Skill Registry — Runtime discovery and consent system for third-party skills.
//
// Unlike the first-party extension system (@semblance/dr), the skill registry
// provides declaration validation, explicit consent per capability, runtime
// registration without restart, and uninstall support.
//
// Skills are persisted in config.db. Skill files in ~/.semblance/skills/{id}/.
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';
import type { SkillDeclaration, SkillCapability } from './skill-declaration.js';
import { validateSkillDeclaration, ALL_CAPABILITIES, CAPABILITY_DESCRIPTIONS } from './skill-declaration.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface InstalledSkill {
  declaration: SkillDeclaration;
  installPath: string;
  installedAt: string;
  consentedCapabilities: SkillCapability[];
  enabled: boolean;
  loadedAt: string | null;
}

export interface InstallResult {
  success: boolean;
  skillId?: string;
  error?: string;
}

// ─── SQLite Schema ─────────────────────────────────────────────────────────────

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS installed_skills (
    skill_id TEXT PRIMARY KEY,
    declaration_json TEXT NOT NULL,
    install_path TEXT NOT NULL,
    consented_capabilities TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    installed_at TEXT NOT NULL,
    loaded_at TEXT
  );
`;

// ─── Skill Registry ────────────────────────────────────────────────────────────

export class SkillRegistry {
  private db: DatabaseHandle;
  private skillsDir: string;
  private loadedSkills: Map<string, { module: unknown; loadedAt: string }> = new Map();

  constructor(db: DatabaseHandle, skillsDir: string) {
    this.db = db;
    this.skillsDir = skillsDir;
    this.db.exec(CREATE_TABLE);
  }

  /**
   * Install a skill from a declaration object + source path.
   * Validates the declaration and stores if valid.
   */
  async install(declaration: SkillDeclaration, sourcePath: string, consentedCapabilities?: SkillCapability[]): Promise<InstallResult> {
    // Validate declaration
    const validation = validateSkillDeclaration(declaration);
    if (!validation.valid) {
      return { success: false, error: `Invalid declaration: ${validation.errors.join(', ')}` };
    }

    // Check for duplicate
    const existing = this.get(declaration.id);
    if (existing) {
      return { success: false, error: `Skill '${declaration.id}' is already installed` };
    }

    // Default: consent all requested capabilities
    const consented = consentedCapabilities ?? declaration.capabilities;

    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO installed_skills (skill_id, declaration_json, install_path, consented_capabilities, enabled, installed_at, loaded_at)
      VALUES (?, ?, ?, ?, 1, ?, NULL)
    `).run(
      declaration.id,
      JSON.stringify(declaration),
      sourcePath,
      JSON.stringify(consented),
      now,
    );

    return { success: true, skillId: declaration.id };
  }

  /**
   * Uninstall a skill. Removes from database (disk cleanup is caller's responsibility).
   */
  async uninstall(skillId: string): Promise<void> {
    this.loadedSkills.delete(skillId);
    this.db.prepare('DELETE FROM installed_skills WHERE skill_id = ?').run(skillId);
  }

  /**
   * Enable a previously disabled skill.
   */
  enable(skillId: string): void {
    this.db.prepare('UPDATE installed_skills SET enabled = 1 WHERE skill_id = ?').run(skillId);
  }

  /**
   * Disable a skill without uninstalling it.
   */
  disable(skillId: string): void {
    this.db.prepare('UPDATE installed_skills SET enabled = 0 WHERE skill_id = ?').run(skillId);
    this.loadedSkills.delete(skillId);
  }

  /**
   * Load all enabled installed skills at daemon startup.
   */
  async loadAll(_orchestrator: unknown): Promise<void> {
    const skills = this.list().filter(s => s.enabled);
    for (const skill of skills) {
      try {
        // Dynamic import of the skill's entry point
        const entryPath = `${skill.installPath}/${skill.declaration.entryPoint}`;
        const mod = await import(entryPath);

        if (mod.default?.initialize) {
          await mod.default.initialize({ skillId: skill.declaration.id });
        }

        this.loadedSkills.set(skill.declaration.id, {
          module: mod,
          loadedAt: new Date().toISOString(),
        });

        // Update loaded_at
        this.db.prepare('UPDATE installed_skills SET loaded_at = ? WHERE skill_id = ?')
          .run(new Date().toISOString(), skill.declaration.id);

        console.error(`[SkillRegistry] Loaded skill: ${skill.declaration.name} (${skill.declaration.id})`);
      } catch (err) {
        console.error(`[SkillRegistry] Failed to load skill ${skill.declaration.id}:`, err);
      }
    }
  }

  /**
   * List all installed skills with their status.
   */
  list(): InstalledSkill[] {
    const rows = this.db.prepare(
      'SELECT * FROM installed_skills ORDER BY installed_at ASC'
    ).all() as Array<{
      skill_id: string;
      declaration_json: string;
      install_path: string;
      consented_capabilities: string;
      enabled: number;
      installed_at: string;
      loaded_at: string | null;
    }>;

    return rows.map(r => ({
      declaration: JSON.parse(r.declaration_json) as SkillDeclaration,
      installPath: r.install_path,
      installedAt: r.installed_at,
      consentedCapabilities: JSON.parse(r.consented_capabilities) as SkillCapability[],
      enabled: r.enabled === 1,
      loadedAt: r.loaded_at,
    }));
  }

  /**
   * Get a specific installed skill.
   */
  get(skillId: string): InstalledSkill | null {
    const row = this.db.prepare(
      'SELECT * FROM installed_skills WHERE skill_id = ?'
    ).get(skillId) as {
      skill_id: string;
      declaration_json: string;
      install_path: string;
      consented_capabilities: string;
      enabled: number;
      installed_at: string;
      loaded_at: string | null;
    } | undefined;

    if (!row) return null;

    return {
      declaration: JSON.parse(row.declaration_json) as SkillDeclaration,
      installPath: row.install_path,
      installedAt: row.installed_at,
      consentedCapabilities: JSON.parse(row.consented_capabilities) as SkillCapability[],
      enabled: row.enabled === 1,
      loadedAt: row.loaded_at,
    };
  }

  /**
   * Get all capability strings with descriptions (for UI).
   */
  getCapabilityDescriptions(): Record<string, string> {
    return { ...CAPABILITY_DESCRIPTIONS };
  }
}
