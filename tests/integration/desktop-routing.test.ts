/**
 * Desktop Routing Integration Tests
 *
 * Static analysis validating:
 * - App.tsx imports from react-router-dom
 * - All core routes are defined in Route elements
 * - Morning-brief and knowledge routes present
 * - Sidebar nav config matches the route table
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const APP_TSX = join(ROOT, 'packages', 'desktop', 'src', 'App.tsx');

const appContent = readFileSync(APP_TSX, 'utf-8');

describe('Desktop Routing — Route Configuration', () => {
  it('App.tsx imports from react-router-dom', () => {
    expect(appContent).toContain("from 'react-router-dom'");
    expect(appContent).toContain('Routes');
    expect(appContent).toContain('Route');
  });

  it('App.tsx contains Route elements for all core routes', () => {
    const coreRoutes = ['chat', 'inbox', 'files', 'connections', 'settings', 'privacy'];
    for (const route of coreRoutes) {
      expect(appContent).toContain(`path="/${route}"`);
    }
  });

  it('App.tsx contains Route elements for morning-brief and knowledge', () => {
    expect(appContent).toContain('path="/morning-brief"');
    expect(appContent).toContain('path="/knowledge"');
  });

  it('desktop sidebar nav items match the route table', () => {
    // Extract navItems ids from the sidebar config
    const navItemMatches = appContent.match(/id:\s*'([^']+)'/g);
    expect(navItemMatches).not.toBeNull();

    const navIds = navItemMatches!.map((m) => m.replace(/id:\s*'/, '').replace(/'$/, ''));

    // Every nav item should have a corresponding route (or be navigable via the sidebar)
    // Extract route paths from Route elements
    const routeMatches = appContent.match(/path="\/([^"]+)"/g);
    expect(routeMatches).not.toBeNull();

    const routePaths = routeMatches!.map((m) => m.replace('path="/', '').replace('"', ''));

    // Every sidebar nav id should correspond to a route path
    for (const navId of navIds) {
      expect(routePaths).toContain(navId);
    }
  });
});
