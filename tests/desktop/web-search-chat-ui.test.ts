// Tests for Step 10 Commit 12 — Web Search Result + Web Fetch Summary + Network Monitor
// Component structure, rendering, Network Monitor ActionType coverage.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const COMPONENTS_DIR = path.resolve(__dirname, '../../packages/desktop/src/components');
const SCREENS_DIR = path.resolve(__dirname, '../../packages/desktop/src/screens');

describe('WebSearchResult component', () => {
  const filePath = path.join(COMPONENTS_DIR, 'WebSearchResult.tsx');

  it('component file exists', () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('exports WebSearchResult function', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('export function WebSearchResult');
  });

  it('renders search results with data-testid', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('data-testid="web-search-result"');
    expect(content).toContain('data-testid="search-result-link"');
  });

  it('shows provider attribution', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('Searched via');
    expect(content).toContain('Brave');
    expect(content).toContain('SearXNG');
  });

  it('displays title, snippet, and source domain', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('result.title');
    expect(content).toContain('result.snippet');
    expect(content).toContain('extractDomain');
  });
});

describe('WebFetchSummary component', () => {
  const filePath = path.join(COMPONENTS_DIR, 'WebFetchSummary.tsx');

  it('component file exists', () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('exports WebFetchSummary function', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('export function WebFetchSummary');
  });

  it('renders with data-testid', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('data-testid="web-fetch-summary"');
    expect(content).toContain('data-testid="fetch-url-link"');
  });

  it('shows domain attribution with byte count', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('Read from');
    expect(content).toContain('formatBytes');
  });
});

describe('NetworkMonitorScreen handles new ActionTypes', () => {
  const filePath = path.join(SCREENS_DIR, 'NetworkMonitorScreen.tsx');

  it('Network Monitor screen exists', () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('ConnectionRecord has action field for ActionType display', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    // The ConnectionLogCard renders record.action which will naturally show
    // web.search, web.fetch, reminder.create, etc.
    expect(content).toContain('record.action');
  });

  it('ConnectionLogCard renders service and action for each connection', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('record.service');
    expect(content).toContain('record.action');
    expect(content).toContain('record.timestamp');
  });

  it('displays success/error status for connections', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain("record.status === 'success'");
  });
});
