import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { AlterEgoWeekEngine } from '../../packages/core/agent/alter-ego-week-engine.js';
import type { DatabaseHandle } from '../../packages/core/platform/types.js';

describe('Sprint G.5 — Alter Ego Week Engine', () => {
  let db: Database.Database;
  let engine: AlterEgoWeekEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    // Create tables the engine queries
    db.exec(`
      CREATE TABLE indexed_emails (id TEXT PRIMARY KEY, priority TEXT DEFAULT 'normal');
      CREATE TABLE indexed_calendar_events (id TEXT PRIMARY KEY, start_time TEXT);
      CREATE TABLE recurring_charges (id TEXT PRIMARY KEY);
    `);
    engine = new AlterEgoWeekEngine(db as unknown as DatabaseHandle);
  });

  it('starts with inactive state', () => {
    const state = engine.getState();
    expect(state.active).toBe(false);
    expect(state.currentDay).toBeNull();
    expect(state.completedDays).toEqual([]);
  });

  it('starts Alter Ego Week and sets day 1', async () => {
    const state = await engine.start();
    expect(state.active).toBe(true);
    expect(state.currentDay).toBe(1);
    expect(state.startedAt).not.toBeNull();
  });

  it('runs Day 1 demo and returns result', async () => {
    await engine.start();
    const result = await engine.runDayDemo(1);
    expect(result.day).toBe(1);
    expect(result.title).toBe('Email Intelligence');
    expect(result.summary).toContain('email');
    expect(result.actionsTaken.length).toBeGreaterThan(0);
  });

  it('advances days correctly', async () => {
    await engine.start();
    await engine.runDayDemo(1);
    const state = await engine.advanceDay();
    expect(state.currentDay).toBe(2);
  });

  it('marks days as completed', async () => {
    await engine.start();
    await engine.runDayDemo(1);
    const state = engine.getState();
    expect(state.completedDays).toContain(1);
  });

  it('Day 7 offers activation', async () => {
    await engine.start();
    for (let d = 1; d <= 6; d++) {
      await engine.runDayDemo(d as 1);
      await engine.advanceDay();
    }
    await engine.runDayDemo(7);
    const state = engine.getState();
    expect(state.activationOffered).toBe(true);
  });

  it('acceptActivation sets userActivated', async () => {
    await engine.start();
    await engine.runDayDemo(7);
    await engine.acceptActivation();
    const state = engine.getState();
    expect(state.userActivated).toBe(true);
    expect(state.active).toBe(false);
  });

  it('skip deactivates the week', async () => {
    await engine.start();
    engine.skip();
    const state = engine.getState();
    expect(state.active).toBe(false);
  });

  it('reset clears all state', async () => {
    await engine.start();
    await engine.runDayDemo(1);
    engine.reset();
    const state = engine.getState();
    expect(state.active).toBe(false);
    expect(state.currentDay).toBeNull();
    expect(state.completedDays).toEqual([]);
  });
});
