import type { CellValue, RowEdit } from '@shared/types/database';

/**
 * Builders for the row-level DML that the grid editor issues.
 *
 * These used to be composed in the renderer with hardcoded MySQL backticks and
 * interpolated values, which meant cell edits emitted invalid SQL on Postgres,
 * SQL Server and Oracle. Building them here lets each driver supply its own
 * quoting and placeholder style, and lets values be bound rather than pasted
 * into the statement.
 */

export interface DmlContext {
  /** Dialect-correct quoting for identifiers. */
  escId: (name: string) => string;
  /** Placeholder for a 0-based parameter index (`?`, `$1`, `:1`, ...). */
  placeholder: (index: number) => string;
  /** Dialect-correct quoting for literals — display only, never executed. */
  escLiteral: (value: string) => string;
  /** Fully-qualified, already-escaped table reference. */
  tableRef: string;
}

export interface BuiltStatement {
  sql: string;
  params: unknown[];
  /**
   * The same statement with values inlined instead of bound. Shown in the
   * confirmation dialog so the user reviews what actually runs; never sent to
   * the database.
   */
  display: string;
}

/** Collects a bound parameter and returns its placeholder + display text. */
class Binder {
  readonly params: unknown[] = [];

  bind(value: string, ctx: DmlContext): { slot: string; shown: string } {
    const slot = ctx.placeholder(this.params.length);
    this.params.push(value);
    return { slot, shown: ctx.escLiteral(value) };
  }
}

/** Renders a cell as either a bound placeholder or passed-through SQL. */
function renderCell(value: CellValue, ctx: DmlContext, binder: Binder): { slot: string; shown: string } {
  if (value.kind === 'expr') return { slot: value.expr, shown: value.expr };
  if (value.value === null) return { slot: 'NULL', shown: 'NULL' };
  return binder.bind(value.value, ctx);
}

/**
 * `col = ?` for each key, except NULLs which become `col IS NULL` — `= NULL`
 * matches nothing, so the previous string-built version could silently fail to
 * find the row it meant to edit.
 */
function buildWhere(ctx: DmlContext, pk: Record<string, unknown>, binder: Binder) {
  const sqlParts: string[] = [];
  const shownParts: string[] = [];

  for (const [col, value] of Object.entries(pk)) {
    const id = ctx.escId(col);
    if (value === null || value === undefined) {
      sqlParts.push(`${id} IS NULL`);
      shownParts.push(`${id} IS NULL`);
    } else {
      const { slot, shown } = binder.bind(String(value), ctx);
      sqlParts.push(`${id} = ${slot}`);
      shownParts.push(`${id} = ${shown}`);
    }
  }
  return { sql: sqlParts.join(' AND '), display: shownParts.join(' AND ') };
}

/** Builds the statement for one grid edit, in the driver's own dialect. */
export function buildRowEdit(ctx: DmlContext, edit: RowEdit): BuiltStatement {
  const binder = new Binder();

  if (edit.op === 'insert') {
    const cols: string[] = [];
    const slots: string[] = [];
    const shown: string[] = [];

    for (const [col, value] of Object.entries(edit.values)) {
      cols.push(ctx.escId(col));
      const rendered = renderCell(value, ctx, binder);
      slots.push(rendered.slot);
      shown.push(rendered.shown);
    }
    if (cols.length === 0) throw new Error('No columns to insert');

    const colList = cols.join(', ');
    return {
      sql: `INSERT INTO ${ctx.tableRef} (${colList}) VALUES (${slots.join(', ')})`,
      params: binder.params,
      display: `INSERT INTO ${ctx.tableRef} (${colList}) VALUES (${shown.join(', ')})`,
    };
  }

  if (edit.op === 'update') {
    const set = renderCell(edit.value, ctx, binder);
    const where = buildWhere(ctx, edit.pk, binder);
    if (!where.sql) throw new Error('Refusing to UPDATE without a key — the table has no primary key.');

    const col = ctx.escId(edit.column);
    return {
      sql: `UPDATE ${ctx.tableRef} SET ${col} = ${set.slot} WHERE ${where.sql}`,
      params: binder.params,
      display: `UPDATE ${ctx.tableRef} SET ${col} = ${set.shown} WHERE ${where.display}`,
    };
  }

  const where = buildWhere(ctx, edit.pk, binder);
  if (!where.sql) throw new Error('Refusing to DELETE without a key — the table has no primary key.');

  return {
    sql: `DELETE FROM ${ctx.tableRef} WHERE ${where.sql}`,
    params: binder.params,
    display: `DELETE FROM ${ctx.tableRef} WHERE ${where.display}`,
  };
}
