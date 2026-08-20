import { describe, it, expect } from 'vitest';
import type { IDatabaseDriver } from '@shared/types/database';

export interface SharedSuiteOpts {
  db: string;
  expectInDatabases: string;
  expectedTables?: string[];
}

const DEFAULT_TABLES = ['categories', 'customers', 'products', 'orders', 'order_items'];

export function runSharedSuite(
  getDriver: () => IDatabaseDriver,
  opts: SharedSuiteOpts,
  skipWhen?: () => boolean,
) {
  const tables = opts.expectedTables ?? DEFAULT_TABLES;
  // Wraps test body: skip at runtime if skipWhen() is true (used for optional DBs like Oracle)
  const s = (fn: () => void | Promise<void>) =>
    async ({ skip }: { skip: () => void }) => { if (skipWhen?.()) { skip(); return; } await fn(); };

  // ── Schema discovery ──────────────────────────────────────────────────────

  describe('getDatabases', () => {
    it('returns array with expected entry', s(async () => {
      const dbs = await getDriver().getDatabases();
      expect(Array.isArray(dbs)).toBe(true);
      expect(dbs.length).toBeGreaterThan(0);
      expect(dbs.map(d => d.name.toLowerCase())).toContain(opts.expectInDatabases.toLowerCase());
    }));
  });

  describe('getTables', () => {
    it('returns seeded tables', s(async () => {
      const result = await getDriver().getTables(opts.db);
      const names = result.map(t => t.name.toLowerCase());
      for (const t of tables) expect(names).toContain(t);
    }));
  });

  describe('getSchema', () => {
    it('returns map with column lists', s(async () => {
      const schema = await getDriver().getSchema(opts.db);
      const keys = Object.keys(schema).map(k => k.toLowerCase());
      for (const t of tables) expect(keys).toContain(t);
      const customerKey = Object.keys(schema).find(k => k.toLowerCase() === 'customers')!;
      const cols = schema[customerKey].map((c: string) => c.toLowerCase());
      expect(cols).toContain('id');
      expect(cols).toContain('name');
      expect(cols).toContain('email');
    }));
  });

  describe('getTableColumns', () => {
    it('returns columns with correct structure for customers', s(async () => {
      const cols = await getDriver().getTableColumns(opts.db, 'customers');
      expect(cols.length).toBeGreaterThan(4);
      const byName = Object.fromEntries(cols.map(c => [c.name.toLowerCase(), c]));
      expect(byName['id']).toBeDefined();
      expect(byName['id'].key).toBe('PRI');
      expect(byName['email']).toBeDefined();
      expect(byName['email'].nullable).toBe(false);
      expect(byName['balance']).toBeDefined();
    }));
  });

  describe('getTableIndexes', () => {
    it('returns PRIMARY and UNIQUE indexes for customers', s(async () => {
      const indexes = await getDriver().getTableIndexes(opts.db, 'customers');
      const types = indexes.map(i => i.type);
      expect(types).toContain('PRIMARY');
      expect(types).toContain('UNIQUE');
      const pk = indexes.find(i => i.type === 'PRIMARY');
      expect(pk!.columns.map((c: string) => c.toLowerCase())).toContain('id');
    }));
  });

  describe('getTableForeignKeys', () => {
    it('returns FK from orders to customers', s(async () => {
      const fks = await getDriver().getTableForeignKeys(opts.db, 'orders');
      expect(fks.length).toBeGreaterThan(0);
      const fk = fks.find(f => f.referencedTable.toLowerCase() === 'customers');
      expect(fk).toBeDefined();
      expect(fk!.columns.map((c: string) => c.toLowerCase())).toContain('customer_id');
      expect(fk!.referencedColumns.map((c: string) => c.toLowerCase())).toContain('id');
    }));
  });

  describe('getTableCreateStatement', () => {
    it('returns non-empty DDL string', s(async () => {
      const ddl = await getDriver().getTableCreateStatement(opts.db, 'categories');
      expect(typeof ddl).toBe('string');
      expect(ddl.length).toBeGreaterThan(10);
    }));
  });

  // ── Data retrieval ────────────────────────────────────────────────────────

  describe('getTableData', () => {
    it('returns 10 rows with total=10 for customers', s(async () => {
      const result = await getDriver().getTableData(opts.db, 'customers', 10, 0);
      expect(result.total).toBe(10);
      expect(result.rows.length).toBe(10);
      expect(result.columns.length).toBeGreaterThan(4);
    }));

    it('paginates: offset 5 returns 5 rows', s(async () => {
      const result = await getDriver().getTableData(opts.db, 'customers', 5, 5);
      expect(result.rows.length).toBe(5);
      expect(result.total).toBe(10);
    }));

    it('sorts DESC by name', s(async () => {
      const result = await getDriver().getTableData(opts.db, 'customers', 10, 0, [{ column: 'name', direction: 'DESC' }]);
      expect(result.rows.length).toBe(10);
      const names = result.rows.map(r => {
        const v = r['name'] ?? r['NAME'];
        return typeof v === 'string' ? v : '';
      });
      const sorted = [...names].sort((a, b) => b.localeCompare(a));
      expect(names).toEqual(sorted);
    }));

    it('text filter finds Alice', s(async () => {
      const result = await getDriver().getTableData(opts.db, 'customers', 10, 0, [], 'Alice');
      expect(result.rows.length).toBe(1);
      expect(result.total).toBe(1);
    }));

    it('raw WHERE filter by balance', s(async () => {
      const result = await getDriver().getTableData(opts.db, 'customers', 20, 0, [], 'WHERE balance > 1000');
      expect(result.total).toBe(3);
    }));
  });

  // ── Query execution ───────────────────────────────────────────────────────

  describe('executeQuery', () => {
    it('SELECT returns array', s(async () => {
      const rows = await getDriver().executeQuery(`SELECT * FROM customers`);
      expect(Array.isArray(rows)).toBe(true);
      expect((rows as any[]).length).toBe(10);
    }));

    // Identifiers are left unquoted on purpose: every dialect's seed creates
    // `categories` unquoted, and Oracle folds unquoted names to upper case —
    // so a quoted lower-case "categories" would not resolve there.
    const countNamed = async (label: string) => {
      const rows = await getDriver().executeQuery(
        `SELECT name FROM categories WHERE name = '${label}'`,
      );
      return (rows as any[]).length;
    };
    const insertNamed = (label: string) =>
      getDriver().executeQuery(`INSERT INTO categories (name) VALUES ('${label}')`);
    const deleteNamed = (label: string) =>
      getDriver().executeQuery(`DELETE FROM categories WHERE name = '${label}'`);

    // Regression guard: the Oracle driver left node-oracledb's autoCommit at
    // its `false` default, so writes were silently discarded on disconnect.
    // The suite only ever ran SELECTs, so nothing caught it.
    it('DML auto-commits and is visible to a later read', s(async () => {
      await insertNamed('dml-roundtrip');
      try {
        expect(await countNamed('dml-roundtrip')).toBe(1);
      } finally {
        await deleteNamed('dml-roundtrip');
      }
    }));

    it('rollback discards DML', s(async () => {
      await getDriver().beginTransaction();
      await insertNamed('tx-rollback');
      await getDriver().rollback();

      expect(await countNamed('tx-rollback')).toBe(0);
    }));

    it('commit persists DML', s(async () => {
      await getDriver().beginTransaction();
      await insertNamed('tx-commit');
      await getDriver().commit();

      try {
        expect(await countNamed('tx-commit')).toBe(1);
      } finally {
        await deleteNamed('tx-commit');
      }
    }));
  });

  // ── Escaping ──────────────────────────────────────────────────────────────

  describe('escapeIdentifier / escapeStringLiteral', () => {
    it('escapeIdentifier wraps in appropriate quotes', s(() => {
      const escaped = getDriver().escapeIdentifier('my column');
      expect(escaped).toContain('my column');
      expect(escaped.length).toBeGreaterThan('my column'.length);
    }));

    it('escapeStringLiteral escapes single quotes', s(() => {
      const escaped = getDriver().escapeStringLiteral("it's");
      expect(escaped).toContain("'");
      expect(escaped).not.toBe("'it's'");
    }));
  });
}
