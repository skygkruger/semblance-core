import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { validateSkillDeclaration, ALL_CAPABILITIES, CAPABILITY_DESCRIPTIONS } from '../../packages/core/skills/skill-declaration.js';
import { SkillRegistry } from '../../packages/core/skills/skill-registry.js';
import type { DatabaseHandle } from '../../packages/core/platform/types.js';

describe('Sprint G — Skill Declaration Validation', () => {
  const validDecl = {
    id: 'com.example.test-skill',
    name: 'Test Skill',
    version: '1.0.0',
    author: 'Test Author',
    description: 'A test skill',
    capabilities: ['knowledge_graph_read', 'notification'] as const,
    tools: [{ name: 'test_tool', description: 'Does something', parameters: {} }],
    entryPoint: 'index.js',
    minSemblanceVersion: '1.0.0',
  };

  it('validates a correct declaration', () => {
    const result = validateSkillDeclaration(validDecl);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects invalid id format', () => {
    const result = validateSkillDeclaration({ ...validDecl, id: 'not-reverse-domain' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('reverse-domain'))).toBe(true);
  });

  it('rejects invalid semver version', () => {
    const result = validateSkillDeclaration({ ...validDecl, version: 'v1' });
    expect(result.valid).toBe(false);
  });

  it('rejects empty tools array', () => {
    const result = validateSkillDeclaration({ ...validDecl, tools: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('at least one'))).toBe(true);
  });

  it('rejects unknown capabilities', () => {
    const result = validateSkillDeclaration({ ...validDecl, capabilities: ['unknown_cap' as any] });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('unknown capability'))).toBe(true);
  });

  it('rejects absolute entryPoint paths', () => {
    const result = validateSkillDeclaration({ ...validDecl, entryPoint: '/etc/passwd' });
    expect(result.valid).toBe(false);
  });

  it('rejects parent-traversal entryPoint paths', () => {
    const result = validateSkillDeclaration({ ...validDecl, entryPoint: '../../../evil.js' });
    expect(result.valid).toBe(false);
  });

  it('has all capability descriptions defined', () => {
    for (const cap of ALL_CAPABILITIES) {
      expect(CAPABILITY_DESCRIPTIONS[cap]).toBeDefined();
      expect(CAPABILITY_DESCRIPTIONS[cap].length).toBeGreaterThan(0);
    }
  });
});

describe('Sprint G — Skill Registry', () => {
  let db: Database.Database;
  let registry: SkillRegistry;

  const testDecl = {
    id: 'com.example.test',
    name: 'Test',
    version: '1.0.0',
    author: 'Author',
    description: 'Test skill',
    capabilities: ['notification'] as const,
    tools: [{ name: 'test_tool', description: 'Test', parameters: {} }],
    entryPoint: 'index.js',
    minSemblanceVersion: '1.0.0',
  };

  beforeEach(() => {
    db = new Database(':memory:');
    registry = new SkillRegistry(db as unknown as DatabaseHandle, '/tmp/skills');
  });

  it('installs a valid skill', async () => {
    const result = await registry.install(testDecl as any, '/tmp/skills/com.example.test');
    expect(result.success).toBe(true);
    expect(result.skillId).toBe('com.example.test');
  });

  it('rejects duplicate skill installation', async () => {
    await registry.install(testDecl as any, '/tmp/test');
    const result = await registry.install(testDecl as any, '/tmp/test');
    expect(result.success).toBe(false);
    expect(result.error).toContain('already installed');
  });

  it('lists installed skills', async () => {
    await registry.install(testDecl as any, '/tmp/test');
    const skills = registry.list();
    expect(skills).toHaveLength(1);
    expect(skills[0]!.declaration.id).toBe('com.example.test');
  });

  it('gets a specific skill by ID', async () => {
    await registry.install(testDecl as any, '/tmp/test');
    const skill = registry.get('com.example.test');
    expect(skill).not.toBeNull();
    expect(skill!.enabled).toBe(true);
  });

  it('disables and enables skills', async () => {
    await registry.install(testDecl as any, '/tmp/test');
    registry.disable('com.example.test');
    expect(registry.get('com.example.test')!.enabled).toBe(false);
    registry.enable('com.example.test');
    expect(registry.get('com.example.test')!.enabled).toBe(true);
  });

  it('uninstalls a skill', async () => {
    await registry.install(testDecl as any, '/tmp/test');
    await registry.uninstall('com.example.test');
    expect(registry.get('com.example.test')).toBeNull();
  });

  it('stores consented capability subset', async () => {
    await registry.install(testDecl as any, '/tmp/test', ['notification']);
    const skill = registry.get('com.example.test');
    expect(skill!.consentedCapabilities).toEqual(['notification']);
  });

  it('rejects invalid declarations at install', async () => {
    const result = await registry.install({ id: 'bad' } as any, '/tmp/test');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid declaration');
  });
});
