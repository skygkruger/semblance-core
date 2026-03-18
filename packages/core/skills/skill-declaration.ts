// Skill Declaration — Schema for third-party sovereign skills.
//
// A skill is a JSON declaration file that describes what the skill can do
// and what capabilities it needs. Declaration validation, explicit user consent
// per capability, runtime registration without restart, and uninstall support.
//
// CRITICAL: This file is in packages/core/. No network imports.

// ─── Types ─────────────────────────────────────────────────────────────────────

export type SkillCapability =
  | 'knowledge_graph_read'
  | 'knowledge_graph_write'
  | 'calendar_read'
  | 'email_read'
  | 'system_execute'
  | 'network_fetch'
  | 'canvas_push'
  | 'notification';

export const ALL_CAPABILITIES: readonly SkillCapability[] = [
  'knowledge_graph_read',
  'knowledge_graph_write',
  'calendar_read',
  'email_read',
  'system_execute',
  'network_fetch',
  'canvas_push',
  'notification',
] as const;

export const CAPABILITY_DESCRIPTIONS: Record<SkillCapability, string> = {
  knowledge_graph_read: 'Read your knowledge graph (documents, contacts, emails metadata)',
  knowledge_graph_write: 'Add nodes to your knowledge graph',
  calendar_read: 'Read your calendar events',
  email_read: 'Read indexed email metadata (subject, sender, date)',
  system_execute: 'Execute binaries on your system (subject to binary allowlist)',
  network_fetch: 'Make outbound HTTP requests via the Gateway',
  canvas_push: 'Push updates to the canvas panel',
  notification: 'Send OS notifications',
};

export interface SkillToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema
}

export interface SkillDeclaration {
  id: string;                   // reverse-domain: 'com.example.my-skill'
  name: string;                 // human-readable: 'My Skill'
  version: string;              // semver: '1.0.0'
  author: string;               // display name or org
  description: string;          // what this skill does (shown in consent UI)
  capabilities: SkillCapability[];
  tools: SkillToolDeclaration[];
  entryPoint: string;           // relative path to JS module
  minSemblanceVersion: string;  // minimum Semblance version required
}

// ─── Validation ────────────────────────────────────────────────────────────────

const REVERSE_DOMAIN_REGEX = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateSkillDeclaration(decl: unknown): ValidationResult {
  const errors: string[] = [];

  if (!decl || typeof decl !== 'object') {
    return { valid: false, errors: ['Declaration must be a non-null object'] };
  }

  const d = decl as Record<string, unknown>;

  // id
  if (typeof d.id !== 'string' || !REVERSE_DOMAIN_REGEX.test(d.id)) {
    errors.push(`id must match reverse-domain format (e.g., 'com.example.my-skill'), got: '${d.id}'`);
  }

  // name
  if (typeof d.name !== 'string' || d.name.trim().length === 0) {
    errors.push('name must be a non-empty string');
  }

  // version
  if (typeof d.version !== 'string' || !SEMVER_REGEX.test(d.version)) {
    errors.push(`version must be valid semver (e.g., '1.0.0'), got: '${d.version}'`);
  }

  // author
  if (typeof d.author !== 'string' || d.author.trim().length === 0) {
    errors.push('author must be a non-empty string');
  }

  // description
  if (typeof d.description !== 'string' || d.description.trim().length === 0) {
    errors.push('description must be a non-empty string');
  }

  // capabilities
  if (!Array.isArray(d.capabilities)) {
    errors.push('capabilities must be an array');
  } else {
    for (const cap of d.capabilities) {
      if (!ALL_CAPABILITIES.includes(cap as SkillCapability)) {
        errors.push(`unknown capability: '${cap}'`);
      }
    }
  }

  // tools
  if (!Array.isArray(d.tools)) {
    errors.push('tools must be an array');
  } else if (d.tools.length === 0) {
    errors.push('tools must have at least one entry (a skill with no tools is pointless)');
  } else {
    for (let i = 0; i < d.tools.length; i++) {
      const tool = d.tools[i] as Record<string, unknown>;
      if (typeof tool?.name !== 'string') errors.push(`tools[${i}].name must be a string`);
      if (typeof tool?.description !== 'string') errors.push(`tools[${i}].description must be a string`);
    }
  }

  // entryPoint
  if (typeof d.entryPoint !== 'string' || d.entryPoint.trim().length === 0) {
    errors.push('entryPoint must be a non-empty string');
  } else if (d.entryPoint.startsWith('/') || d.entryPoint.startsWith('..')) {
    errors.push('entryPoint must be a relative path within the skill directory');
  }

  // minSemblanceVersion
  if (typeof d.minSemblanceVersion !== 'string' || !SEMVER_REGEX.test(d.minSemblanceVersion)) {
    errors.push(`minSemblanceVersion must be valid semver, got: '${d.minSemblanceVersion}'`);
  }

  return { valid: errors.length === 0, errors };
}
