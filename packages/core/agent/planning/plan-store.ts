// Delegated plan persistence — SQLite under an injectable data directory.
// Steps are stored as JSON within each plan row (local-only, no network).

import Database from 'better-sqlite3';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  CreatePlanInput,
  DelegatedPlan,
  ListPlansOptions,
  PlanStep,
  UpdatePlanInput,
} from './plan-types.js';
import { createDelegatedPlan, updateDelegatedPlan } from './plan-lifecycle.js';

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS delegated_plans (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    steps_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_delegated_plans_status ON delegated_plans(status);
  CREATE INDEX IF NOT EXISTS idx_delegated_plans_updated_at ON delegated_plans(updated_at DESC);
`;

interface PlanRow {
  id: string;
  title: string;
  status: string;
  steps_json: string;
  created_at: string;
  updated_at: string;
}

export interface PlanStore {
  create(input: CreatePlanInput): DelegatedPlan;
  get(planId: string): DelegatedPlan | null;
  list(options?: ListPlansOptions): DelegatedPlan[];
  update(planId: string, input: UpdatePlanInput): DelegatedPlan;
}

function rowToPlan(row: PlanRow): DelegatedPlan {
  return {
    id: row.id,
    title: row.title,
    status: row.status as DelegatedPlan['status'],
    steps: JSON.parse(row.steps_json) as PlanStep[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createPlanStore(dataDir: string): PlanStore {
  const dbPath = join(dataDir, 'plans.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(CREATE_TABLE);

  const insertStmt = db.prepare(`
    INSERT INTO delegated_plans (
      id, title, status, steps_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const updateStmt = db.prepare(`
    UPDATE delegated_plans
    SET title = ?, status = ?, steps_json = ?, updated_at = ?
    WHERE id = ?
  `);

  const getStmt = db.prepare('SELECT * FROM delegated_plans WHERE id = ?');

  return {
    create(input) {
      const plan = createDelegatedPlan(input, randomUUID);
      insertStmt.run(
        plan.id,
        plan.title,
        plan.status,
        JSON.stringify(plan.steps),
        plan.createdAt,
        plan.updatedAt,
      );
      return plan;
    },

    get(planId) {
      const row = getStmt.get(planId) as PlanRow | undefined;
      return row ? rowToPlan(row) : null;
    },

    list(options = {}) {
      const limit = options.limit ?? 100;
      const offset = options.offset ?? 0;
      let rows: PlanRow[];

      if (options.statuses && options.statuses.length > 0) {
        const placeholders = options.statuses.map(() => '?').join(', ');
        rows = db.prepare(`
          SELECT * FROM delegated_plans
          WHERE status IN (${placeholders})
          ORDER BY updated_at DESC
          LIMIT ? OFFSET ?
        `).all(...options.statuses, limit, offset) as PlanRow[];
      } else {
        rows = db.prepare(`
          SELECT * FROM delegated_plans
          ORDER BY updated_at DESC
          LIMIT ? OFFSET ?
        `).all(limit, offset) as PlanRow[];
      }

      return rows.map(rowToPlan);
    },

    update(planId, input) {
      const existing = this.get(planId);
      if (!existing) {
        throw new Error(`Plan not found: ${planId}`);
      }
      const updated = updateDelegatedPlan(existing, input);
      updateStmt.run(
        updated.title,
        updated.status,
        JSON.stringify(updated.steps),
        updated.updatedAt,
        updated.id,
      );
      return updated;
    },
  };
}
