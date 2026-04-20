import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { OracleDriver } from '../../src/main/drivers/oracle.driver';
import { runSharedSuite } from './shared-suite';
import { connections } from './connections';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_SQL = readFileSync(resolve(__dirname, '../../docker/oracle/seed.sql'), 'utf8');

// Oracle: "database" parameter in schema methods = schema/owner name (uppercase)
const SCHEMA = 'ARUMU_TEST';
const TMP = 'TEST_TMP'; // Oracle uppercases unquoted identifiers

const SEED_TABLES = ['ORDER_ITEMS', 'ORDERS', 'PRODUCTS', 'CUSTOMERS', 'CATEGORIES'];

function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map(s => s.replace(/--[^\n]*/g, '').trim())
    .filter(s => s.length > 0);
}

describe('OracleDriver', () => {
  let driver: OracleDriver;

  beforeAll(async () => {
    driver = new OracleDriver();
    await driver.connect(connections.oracle);

    // Drop seeded tables (FK order) and temp table from previous runs
    for (const t of [...SEED_TABLES, TMP]) {
      try { await driver.executeQuery(`DROP TABLE "${t}" CASCADE CONSTRAINTS PURGE`); } catch { /* ok */ }
    }

    // Seed schema + data
    for (const stmt of splitStatements(SEED_SQL)) {
      await driver.executeQuery(stmt);
    }

    // Temp table for mutation tests
    await driver.executeQuery(`
      CREATE TABLE "${TMP}" (
        "ID"  NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "VAL" VARCHAR2(100)
      )
    `);
  });

  afterAll(async () => {
    for (const t of [TMP, ...SEED_TABLES]) {
      try { await driver.executeQuery(`DROP TABLE "${t}" CASCADE CONSTRAINTS PURGE`); } catch { /* ignore */ }
    }
    await driver.disconnect();
  });

  // ── Shared read-only tests ────────────────────────────────────────────────
  // Oracle: getDatabases() returns all_users — ARUMU_TEST is a user/schema.
  // getTables(SCHEMA) queries all_tables WHERE owner = UPPER(SCHEMA).
  runSharedSuite(() => driver, {
    db: SCHEMA,
    expectInDatabases: SCHEMA,
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  describe('mutations', () => {
    it('addColumn appends new column', async () => {
      await driver.addColumn(SCHEMA, TMP, { name: 'EXTRA', type: 'VARCHAR2', length: 50, nullable: true });
      const cols = await driver.getTableColumns(SCHEMA, TMP);
      expect(cols.map(c => c.name)).toContain('EXTRA');
    });

    it('addIndex creates regular index', async () => {
      await driver.addIndex(SCHEMA, TMP, { name: 'IDX_TMP_VAL', columns: ['VAL'], unique: false, type: 'INDEX' });
      const idxs = await driver.getTableIndexes(SCHEMA, TMP);
      expect(idxs.map(i => i.name)).toContain('IDX_TMP_VAL');
    });

    it('dropIndex removes index', async () => {
      await driver.dropIndex(SCHEMA, TMP, 'IDX_TMP_VAL');
      const idxs = await driver.getTableIndexes(SCHEMA, TMP);
      expect(idxs.map(i => i.name)).not.toContain('IDX_TMP_VAL');
    });

    it('addForeignKey adds FK', async () => {
      await driver.executeQuery(`ALTER TABLE "${TMP}" ADD "CAT_ID" NUMBER`);
      await driver.addForeignKey(SCHEMA, TMP, {
        name: 'FK_TMP_CAT',
        columns: ['CAT_ID'],
        referencedTable: 'CATEGORIES',
        referencedColumns: ['ID'],
        deleteRule: 'SET NULL',
      });
      const fks = await driver.getTableForeignKeys(SCHEMA, TMP);
      expect(fks.map(f => f.name)).toContain('FK_TMP_CAT');
    });

    it('dropForeignKey removes FK', async () => {
      await driver.dropForeignKey(SCHEMA, TMP, 'FK_TMP_CAT');
      const fks = await driver.getTableForeignKeys(SCHEMA, TMP);
      expect(fks.map(f => f.name)).not.toContain('FK_TMP_CAT');
    });

    it('executeQuery INSERT / SELECT / DELETE', async () => {
      await driver.executeQuery(`INSERT INTO "${TMP}" ("VAL") VALUES ('hello')`);
      const rows = await driver.executeQuery(`SELECT * FROM "${TMP}" WHERE "VAL"='hello'`);
      expect(Array.isArray(rows)).toBe(true);
      expect((rows as any[]).length).toBeGreaterThan(0);
      await driver.executeQuery(`DELETE FROM "${TMP}" WHERE "VAL"='hello'`);
    });
  });

  // ── killProcess input validation ─────────────────────────────────────────
  describe('killProcess', () => {
    it('rejects invalid process id format', async () => {
      await expect(driver.killProcess('not-valid')).rejects.toThrow('sid,serial#');
    });
  });

  // ── Process list (requires SELECT on v$session) ───────────────────────────
  describe('getProcessList', () => {
    it('returns array or fails gracefully on privilege error', async () => {
      try {
        const procs = await driver.getProcessList();
        expect(Array.isArray(procs)).toBe(true);
      } catch (err: any) {
        // ORA-00942 (table/view not found) or ORA-01031 (insufficient privileges)
        if (/ORA-00942|ORA-01031/.test(err.message || '')) return;
        throw err;
      }
    });
  });

  // ── Server variables (requires SELECT on v$parameter) ────────────────────
  describe('getServerVariables', () => {
    it('returns variables array or fails gracefully on privilege error', async () => {
      try {
        const result = await driver.getServerVariables();
        expect(Array.isArray(result.variables)).toBe(true);
        expect(result.variables[0]).toHaveProperty('name');
        expect(result.variables[0]).toHaveProperty('value');
      } catch (err: any) {
        if (/ORA-00942|ORA-01031/.test(err.message || '')) return;
        throw err;
      }
    });
  });
});
