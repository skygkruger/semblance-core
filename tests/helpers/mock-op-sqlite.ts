// Mock @op-engineering/op-sqlite for vitest environment.
export function open(_options: { name: string; location: string }) {
  return {
    execute: (_sql: string, _params?: unknown[]) => ({ rows: { length: 0, item: () => ({}) }, rowsAffected: 0, insertId: 0 }),
    close: () => {},
  };
}
