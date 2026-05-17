import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSQLDriver } from '../../src/main/drivers/postgres.driver';
import { runSharedSuite } from './shared-suite';
import { startPostgres } from './containers';

const DB = 'arumu_test';
const TMP = '_test_tmp';

describe('PostgreSQLDriver', () => {
  let driver: PostgreSQLDriver;
  let stopContainer: () => Promise<void>;

  beforeAll(async () => {
    const { config, stop } = await startPostgres();
    stopContainer = stop;
    driver = new PostgreSQLDriver();
    await driver.connect(config);
    await driver.executeQuery(`DROP TABLE IF EXISTS "${TMP}"`);
    await driver.executeQuery(`
      CREATE TABLE "${TMP}" (
        "id"  SERIAL PRIMARY KEY,
        "val" VARCHAR(100)
      )
    `);
  });

  afterAll(async () => {
    await driver.executeQuery(`DROP TABLE IF EXISTS "${TMP}"`);
    await driver.disconnect();
    await stopContainer();
  });

  // ── Shared read-only tests ────────────────────────────────────────────────
  runSharedSuite(() => driver, {
    db: DB,
    expectInDatabases: DB,
  });

  // ── Multi-database ────────────────────────────────────────────────────────
  describe('multi-database', () => {
    it('arumu_analytics is also visible', async () => {
      const dbs = await driver.getDatabases();
      expect(dbs.map(d => d.name)).toContain('arumu_analytics');
    });
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  describe('mutations', () => {
    it('addColumn appends new column', async () => {
      await driver.addColumn(DB, TMP, { name: 'extra', type: 'VARCHAR', length: 50, nullable: true });
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

    it('addForeignKey adds FK', async () => {
      await driver.executeQuery(`ALTER TABLE "${TMP}" ADD COLUMN "cat_id" INT`);
      await driver.addForeignKey(DB, TMP, {
        name: 'fk_tmp_cat',
        columns: ['cat_id'],
        referencedTable: 'categories',
        referencedColumns: ['id'],
        deleteRule: 'SET NULL',
      });
      const fks = await driver.getTableForeignKeys(DB, TMP);
      expect(fks.map(f => f.name)).toContain('fk_tmp_cat');
    });

    it('dropForeignKey removes FK', async () => {
      await driver.dropForeignKey(DB, TMP, 'fk_tmp_cat');
      const fks = await driver.getTableForeignKeys(DB, TMP);
      expect(fks.map(f => f.name)).not.toContain('fk_tmp_cat');
    });

    it('executeQuery INSERT / UPDATE / DELETE', async () => {
      const ins = await driver.executeQuery(`INSERT INTO "${TMP}" ("val") VALUES ('hello')`);
      expect(ins.affectedRows ?? ins.rowCount).toBeGreaterThanOrEqual(1);
      await driver.executeQuery(`UPDATE "${TMP}" SET "val"='world' WHERE "val"='hello'`);
      await driver.executeQuery(`DELETE FROM "${TMP}" WHERE "val"='world'`);
    });
  });

  // ── Process list ─────────────────────────────────────────────────────────
  describe('getProcessList', () => {
    it('returns array of processes', async () => {
      const procs = await driver.getProcessList();
      expect(Array.isArray(procs)).toBe(true);
    });
  });

  // ── Server variables ─────────────────────────────────────────────────────
  describe('getServerVariables', () => {
    it('returns variables array with name/value pairs', async () => {
      const result = await driver.getServerVariables();
      expect(result.variables.length).toBeGreaterThan(0);
      expect(result.variables[0]).toHaveProperty('name');
      expect(result.variables[0]).toHaveProperty('value');
    });
  });
});
