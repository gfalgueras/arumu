import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SQLiteDriver } from '../../src/main/drivers/sqlite.driver';
import { runSharedSuite } from './shared-suite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_SQL = readFileSync(resolve(__dirname, '../../docker/sqlite/seed.sql'), 'utf8');

// SQLite uses :memory: — seed the database inside beforeAll.
// "database" parameter for schema methods is ignored by this driver.
const DB = 'main'; // SQLite always has "main" as its primary attached database
const TMP = '_test_tmp';

function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map(s => s.replace(/--[^\n]*/g, '').trim())
    .filter(s => s.length > 0);
}

describe('SQLiteDriver', () => {
  let driver: SQLiteDriver;

  beforeAll(async () => {
    driver = new SQLiteDriver();
    await driver.connect({ host: ':memory:', port: 0, user: '' });

    // Seed schema + data
    for (const stmt of splitStatements(SEED_SQL)) {
      await driver.executeQuery(stmt);
    }

    // Temp table for mutation tests
    await driver.executeQuery(`
      CREATE TABLE IF NOT EXISTS "${TMP}" (
        "id"  INTEGER PRIMARY KEY AUTOINCREMENT,
        "val" TEXT
      )
    `);
  });

  afterAll(async () => {
    await driver.executeQuery(`DROP TABLE IF EXISTS "${TMP}"`);
    await driver.disconnect();
  });

  // ── Shared read-only tests ────────────────────────────────────────────────
  // SQLite getDatabases() returns attached databases, not schemas.
  // "main" is the primary database name.
  runSharedSuite(() => driver, {
    db: DB,
    expectInDatabases: 'main',
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  describe('mutations', () => {
    it('addColumn appends nullable column', async () => {
      await driver.addColumn(DB, TMP, { name: 'extra', type: 'TEXT', nullable: true });
      const cols = await driver.getTableColumns(DB, TMP);
      expect(cols.map(c => c.name)).toContain('extra');
    });

    it('addIndex creates regular index', async () => {
      await driver.addIndex(DB, TMP, { name: 'idx_tmp_val', columns: ['val'], unique: false, type: 'INDEX' });
      const idxs = await driver.getTableIndexes(DB, TMP);
      expect(idxs.map(i => i.name)).toContain('idx_tmp_val');
    });

    it('dropIndex removes index', async () => {
      await driver.dropIndex(DB, TMP, 'idx_tmp_val');
      const idxs = await driver.getTableIndexes(DB, TMP);
      expect(idxs.map(i => i.name)).not.toContain('idx_tmp_val');
    });

    it('addForeignKey throws (not supported)', async () => {
      await expect(driver.addForeignKey(DB, TMP, {
        name: 'fk_test', columns: ['id'], referencedTable: 'categories', referencedColumns: ['id'],
      })).rejects.toThrow();
    });

    it('updateColumn throws (not supported)', async () => {
      await expect(driver.updateColumn(DB, TMP, 'val', { name: 'val', type: 'TEXT', nullable: true })).rejects.toThrow();
    });

    it('executeQuery INSERT / SELECT / DELETE', async () => {
      await driver.executeQuery(`INSERT INTO "${TMP}" ("val") VALUES ('hello')`);
      const rows = await driver.executeQuery(`SELECT * FROM "${TMP}" WHERE "val"='hello'`);
      expect((rows as any[]).length).toBe(1);
      await driver.executeQuery(`DELETE FROM "${TMP}" WHERE "val"='hello'`);
    });
  });

  // ── SQLite-specific ───────────────────────────────────────────────────────
  describe('getServerVariables (PRAGMAs)', () => {
    it('returns pragma values', async () => {
      const result = await driver.getServerVariables();
      expect(result.variables.length).toBeGreaterThan(0);
      const foreignKeys = result.variables.find(v => v.name === 'foreign_keys');
      expect(foreignKeys).toBeDefined();
      expect(foreignKeys!.value).toBe('1'); // enabled in connect()
    });
  });
});
