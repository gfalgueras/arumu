import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SQLServerDriver } from '../../src/main/drivers/sqlserver.driver';
import { runSharedSuite } from './shared-suite';
import { connections } from './connections';

const DB = 'arumu_test';
const TMP = '_test_tmp';

describe('SQLServerDriver', () => {
  let driver: SQLServerDriver;

  beforeAll(async () => {
    driver = new SQLServerDriver();
    await driver.connect(connections.sqlserver);
    await driver.executeQuery(`IF OBJECT_ID('${DB}.dbo.${TMP}', 'U') IS NOT NULL DROP TABLE [${DB}].[dbo].[${TMP}]`);
    await driver.executeQuery(`
      CREATE TABLE [${DB}].[dbo].[${TMP}] (
        [id]  INT NOT NULL IDENTITY(1,1),
        [val] NVARCHAR(100),
        CONSTRAINT [pk_${TMP}] PRIMARY KEY ([id])
      )
    `);
  });

  afterAll(async () => {
    try {
      await driver.executeQuery(`DROP TABLE [${DB}].[dbo].[${TMP}]`);
    } catch { /* ignore */ }
    await driver.disconnect();
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
      await driver.addColumn(DB, TMP, { name: 'extra', type: 'NVARCHAR', length: 50, nullable: true });
      const cols = await driver.getTableColumns(DB, TMP);
      expect(cols.map(c => c.name.toLowerCase())).toContain('extra');
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
      await driver.executeQuery(`ALTER TABLE [${DB}].[dbo].[${TMP}] ADD [cat_id] INT`);
      await driver.addForeignKey(DB, TMP, {
        name: 'fk_tmp_cat',
        columns: ['cat_id'],
        referencedTable: 'categories',
        referencedColumns: ['id'],
        deleteRule: 'NO ACTION',
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
      const ins = await driver.executeQuery(`INSERT INTO [${DB}].[dbo].[${TMP}] ([val]) VALUES (N'hello')`);
      expect(ins.affectedRows).toBe(1);
      const upd = await driver.executeQuery(`UPDATE [${DB}].[dbo].[${TMP}] SET [val]=N'world' WHERE [val]=N'hello'`);
      expect(upd.affectedRows).toBe(1);
      const del = await driver.executeQuery(`DELETE FROM [${DB}].[dbo].[${TMP}] WHERE [val]=N'world'`);
      expect(del.affectedRows).toBe(1);
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
    it('returns configuration values', async () => {
      const result = await driver.getServerVariables();
      expect(result.variables.length).toBeGreaterThan(0);
      expect(result.variables[0]).toHaveProperty('name');
      expect(result.variables[0]).toHaveProperty('value');
    });
  });
});
