import type { IDatabaseDriver, SchemaChanges } from '@shared/types/database';

/**
 * The ordered application of a table migration, shared by execution and
 * preview so the two can't drift.
 *
 * Drops run before adds so an index or FK can be recreated under a name that
 * is still taken at the start of the migration.
 */
export async function applySchemaChanges(
  driver: IDatabaseDriver,
  database: string,
  table: string,
  changes: SchemaChanges,
  onStep?: (description: string) => void,
): Promise<void> {
  for (const fk of changes.fksToDrop) {
    onStep?.(`drop foreign key ${fk.name}`);
    await driver.dropForeignKey(database, table, fk.name);
  }
  for (const idx of changes.indexesToDrop) {
    onStep?.(`drop index ${idx.name}`);
    await driver.dropIndex(database, table, idx.name);
  }
  for (const { oldName, newCol, afterColumn } of changes.columnsToUpdate) {
    onStep?.(`update column ${oldName}`);
    await driver.updateColumn(database, table, oldName, newCol, afterColumn);
  }
  for (const { col, afterColumn } of changes.columnsToAdd) {
    onStep?.(`add column ${col.name}`);
    await driver.addColumn(database, table, col, afterColumn);
  }
  for (const idx of changes.indexesToAdd) {
    onStep?.(`add index ${idx.name || '(unnamed)'}`);
    await driver.addIndex(database, table, idx);
  }
  for (const fk of changes.fksToAdd) {
    onStep?.(`add foreign key ${fk.name || '(unnamed)'}`);
    await driver.addForeignKey(database, table, fk);
  }
}

/**
 * Captures the statements a migration would run, by replaying it against the
 * driver with execution suppressed.
 *
 * Because it drives the real code path, the preview cannot go stale relative
 * to what executes. The caveat is that steps which inspect the database while
 * building (SQL Server looking up a DEFAULT constraint to drop, Postgres
 * checking whether an index is constraint-backed) see empty results in this
 * mode, so those statements may be omitted from the preview even though they
 * would run.
 */
export async function collectSchemaChangeSql(
  driver: IDatabaseDriver & { beginDryRun(): void; endDryRun(): string[] },
  database: string,
  table: string,
  changes: SchemaChanges,
): Promise<string[]> {
  driver.beginDryRun();
  try {
    await applySchemaChanges(driver, database, table, changes);
  } catch {
    // A step that inspects the database can fail with execution suppressed —
    // keep whatever statements were captured before that point.
  }
  return driver.endDryRun();
}
