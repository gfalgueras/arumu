import type { ColumnInfo, TableIndex, ForeignKey, SchemaChanges } from '@shared/types/database';

/**
 * Pure schema-diff and ALTER-preview logic, lifted out of TableSchema.vue so
 * it can be read (and tested) without the 1500-line editor around it.
 */

export interface SchemaSnapshot {
  columns: ColumnInfo[];
  originalColumns: ColumnInfo[];
  indexes: TableIndex[];
  originalIndexes: TableIndex[];
  foreignKeys: ForeignKey[];
  originalFKs: ForeignKey[];
}

/** Deep-equality by serialisation; these are plain JSON-shaped records. */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Works out what changed between the edited schema and the version loaded from
 * the database. Columns are matched on the client-side `_id` so a rename is
 * seen as an update rather than a drop plus an add.
 */
export function diffSchema(snapshot: SchemaSnapshot): SchemaChanges {
  const { columns, originalColumns, indexes, originalIndexes, foreignKeys, originalFKs } = snapshot;

  const columnsToUpdate = columns.map(curr => {
    const origIdx = originalColumns.findIndex(o => o._id === curr._id);
    if (origIdx === -1) return null;

    const orig = originalColumns[origIdx];
    const currIdx = columns.indexOf(curr);

    // A column also needs rewriting when only its position moved, which shows
    // up as a change of predecessor.
    const currPrevId = currIdx > 0 ? columns[currIdx - 1]._id : null;
    const origPrevId = origIdx > 0 ? originalColumns[origIdx - 1]._id : null;

    if (!same(curr, orig) || currPrevId !== origPrevId) {
      return {
        oldName: orig.name,
        newCol: curr,
        afterColumn: currIdx > 0 ? columns[currIdx - 1].name : '',
      };
    }
    return null;
  }).filter(Boolean) as SchemaChanges['columnsToUpdate'];

  const columnsToAdd = columns
    .filter(curr => !originalColumns.some(o => o._id === curr._id))
    .map(curr => {
      const idx = columns.indexOf(curr);
      return { col: curr, afterColumn: idx > 0 ? columns[idx - 1].name : '' };
    });

  // Indexes and FKs are matched by name, and a modified one is dropped and
  // re-added rather than altered in place.
  const indexesToDrop = originalIndexes.filter(orig => {
    const current = indexes.find(curr => curr.name === orig.name);
    return !current || !same(current, orig);
  });
  const indexesToAdd = indexes.filter(curr => {
    const orig = originalIndexes.find(o => o.name === curr.name);
    return !orig || !same(orig, curr);
  });

  const fksToDrop = originalFKs.filter(orig => {
    const current = foreignKeys.find(curr => curr.name === orig.name);
    return !current || !same(current, orig);
  });
  const fksToAdd = foreignKeys.filter(curr => {
    const orig = originalFKs.find(o => o.name === curr.name);
    return !orig || !same(orig, curr);
  });

  return { columnsToUpdate, columnsToAdd, indexesToDrop, indexesToAdd, fksToDrop, fksToAdd };
}

// ── ALTER preview ───────────────────────────────────────────────────────────
//
// NOTE: this renders MySQL syntax (backtick quoting, CHANGE COLUMN, COMMENT).
// It is display-only — the migration itself is executed by the driver for the
// connected engine — but the preview will not match what actually runs on
// Postgres, SQL Server or Oracle.

const escId = (name: string) => '`' + name.replace(/`/g, '``') + '`';
const escStr = (val: string) => "'" + val.replace(/'/g, "''") + "'";

function columnDefinition(col: ColumnInfo, afterColumn?: string): string {
  let sql = col.type;
  if (col.length) sql += `(${col.length})`;
  if (col.unsigned) sql += ' UNSIGNED';
  sql += col.nullable ? ' NULL' : ' NOT NULL';

  if (col.default !== undefined) {
    if (col.default === null) sql += ' DEFAULT NULL';
    else if (col.default.toUpperCase() === 'CURRENT_TIMESTAMP') sql += ' DEFAULT CURRENT_TIMESTAMP';
    else sql += ` DEFAULT ${escStr(col.default)}`;
  }

  if (col.extra) sql += ` ${col.extra}`;
  if (col.comment) sql += ` COMMENT ${escStr(col.comment)}`;

  if (afterColumn !== undefined) {
    sql += afterColumn === '' ? ' FIRST' : ` AFTER ${escId(afterColumn)}`;
  }
  return sql;
}

/** Renders the pending migration as a single ALTER TABLE, or null if empty. */
export function buildAlterSql(database: string, table: string, changes: SchemaChanges): string | null {
  const parts: string[] = [];

  for (const { oldName, newCol, afterColumn } of changes.columnsToUpdate) {
    parts.push(`CHANGE COLUMN ${escId(oldName)} ${escId(newCol.name)} ${columnDefinition(newCol, afterColumn)}`);
  }
  for (const { col, afterColumn } of changes.columnsToAdd) {
    parts.push(`ADD COLUMN ${escId(col.name)} ${columnDefinition(col, afterColumn)}`);
  }

  for (const fk of changes.fksToDrop) parts.push(`DROP FOREIGN KEY ${escId(fk.name)}`);
  for (const idx of changes.indexesToDrop) {
    parts.push(idx.name === 'PRIMARY' ? 'DROP PRIMARY KEY' : `DROP INDEX ${escId(idx.name)}`);
  }

  for (const idx of changes.indexesToAdd) {
    const cols = idx.columns.map(escId).join(', ');
    if (idx.type === 'PRIMARY') {
      parts.push(`ADD PRIMARY KEY (${cols})`);
      continue;
    }
    let type = 'INDEX';
    if (idx.type === 'UNIQUE') type = 'UNIQUE INDEX';
    else if (idx.type === 'FULLTEXT') type = 'FULLTEXT INDEX';
    else if (idx.type === 'SPATIAL') type = 'SPATIAL INDEX';
    parts.push(`ADD ${type} ${idx.name ? escId(idx.name) : ''} (${cols})`);
  }

  for (const fk of changes.fksToAdd) {
    const cols = fk.columns.map(escId).join(', ');
    const refTable = `${escId(database)}.${escId(fk.referencedTable)}`;
    const refCols = fk.referencedColumns.map(escId).join(', ');
    const name = fk.name ? `CONSTRAINT ${escId(fk.name)}` : '';

    let sql = `ADD ${name} FOREIGN KEY (${cols}) REFERENCES ${refTable} (${refCols})`;
    if (fk.updateRule) sql += ` ON UPDATE ${fk.updateRule}`;
    if (fk.deleteRule) sql += ` ON DELETE ${fk.deleteRule}`;
    parts.push(sql);
  }

  if (parts.length === 0) return null;
  return `ALTER TABLE ${escId(database)}.${escId(table)}\n  ${parts.join(',\n  ')};`;
}
