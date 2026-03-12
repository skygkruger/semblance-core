// Ambient type declarations for @op-engineering/op-sqlite
// These types cover the API surface used by packages/mobile/src/runtime/platform-adapters.ts

declare module '@op-engineering/op-sqlite' {
  interface QueryResult {
    rows: {
      length: number;
      item(index: number): Record<string, unknown>;
    };
    rowsAffected: number;
    insertId: number;
  }

  interface DB {
    execute(sql: string, params?: unknown[]): QueryResult;
    close(): void;
  }

  function open(options: { name: string; location: string }): DB;
}
