import type { ColumnInfo, TableIndex, ForeignKey, SchemaChanges } from '@shared/types/database';

/**
 * Pure schema-diff logic, lifted out of TableSchema.vue so it can be read (and
 * tested) without the 1500-line editor around it.
 *
 * Rendering the diff as SQL is deliberately not done here: the statements come
 * from the driver via api.previewSchemaChanges(), so the preview matches the
 * connected engine instead of always emitting MySQL.
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

/**
 * Whether the migration would actually do anything. Derived from the diff
 * rather than comparing the raw arrays, so edits that cancel out — a column
 * moved and moved back, an index renamed and renamed again — correctly leave
 * the Save button disabled.
 */
export function hasChanges(changes: SchemaChanges): boolean {
  return changes.columnsToUpdate.length > 0
    || changes.columnsToAdd.length > 0
    || changes.indexesToDrop.length > 0
    || changes.indexesToAdd.length > 0
    || changes.fksToDrop.length > 0
    || changes.fksToAdd.length > 0;
}
