import { createClient, type Client, type InValue, type ResultSet } from "@libsql/client";

function plainRows<T>(result: ResultSet): T[] {
  return result.rows.map(row => Object.fromEntries(result.columns.map(column => [column, row[column]])) as T);
}

// This deliberately exposes only the subset used by the trip API, preserving
// existing parameterized SQLite statements and their compare-and-swap guards.
export class TripStatement {
  constructor(private readonly client: Client, readonly sql: string, readonly args: InValue[] = []) {}

  bind(...args: InValue[]) {
    return new TripStatement(this.client, this.sql, args);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await this.client.execute({ sql: this.sql, args: this.args });
    return plainRows<T>(result)[0] ?? null;
  }

  async all<T = Record<string, unknown>>() {
    const result = await this.client.execute({ sql: this.sql, args: this.args });
    return { results: plainRows<T>(result), meta: { changes: result.rowsAffected } };
  }

  async run() {
    const result = await this.client.execute({ sql: this.sql, args: this.args });
    return { meta: { changes: result.rowsAffected } };
  }
}

export class TripDatabase {
  constructor(private readonly client: Client) {}

  prepare(sql: string) {
    return new TripStatement(this.client, sql);
  }

  async batch(statements: TripStatement[]) {
    if (!statements.length) return [];
    // A write batch is one transaction: errors roll back every statement.
    const results = await this.client.batch(statements.map(statement => ({ sql: statement.sql, args: statement.args })), "write");
    return results.map(result => ({ results: plainRows(result), meta: { changes: result.rowsAffected } }));
  }
}

let active: { url: string; authToken: string | undefined; client: Client; database: TripDatabase } | undefined;

export function getTripDatabase(url: string, authToken?: string) {
  // No client or environment validation runs at import time. Next.js can build
  // before the Marketplace has injected runtime storage credentials.
  if (!active || active.url !== url || active.authToken !== authToken) {
    active?.client.close();
    const client = createClient({ url, authToken, intMode: "number" });
    active = { url, authToken, client, database: new TripDatabase(client) };
  }
  return active.database;
}
