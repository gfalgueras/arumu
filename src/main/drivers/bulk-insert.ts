/**
 * Shared helpers for multi-row INSERT.
 *
 * Bulk inserts are batched rather than sent as one giant statement because
 * every engine caps bind parameters per statement (SQL Server at 2100, and
 * Oracle/MySQL have practical limits too). Keeping each batch under
 * MAX_PARAMS_PER_STATEMENT stays clear of all of them.
 */

const MAX_PARAMS_PER_STATEMENT = 500;

/** Rows per statement, given how many columns each row binds. */
export function batchSize(columnCount: number): number {
  if (columnCount <= 0) return 1;
  return Math.max(1, Math.floor(MAX_PARAMS_PER_STATEMENT / columnCount));
}

/** Splits rows into batches sized for the column count. */
export function batchRows<T>(rows: T[], columnCount: number): T[][] {
  const size = batchSize(columnCount);
  const batches: T[][] = [];
  for (let i = 0; i < rows.length; i += size) batches.push(rows.slice(i, i + size));
  return batches;
}

/**
 * Builds `(?, ?), (?, ?)` for `rowCount` rows of `columnCount` columns.
 * `placeholder` receives the 0-based global parameter index, so dialects with
 * positional markers ($1, :1) can number them.
 */
export function buildValuesClause(
  rowCount: number,
  columnCount: number,
  placeholder: (paramIndex: number) => string,
): string {
  let paramIndex = 0;
  const tuples: string[] = [];
  for (let r = 0; r < rowCount; r++) {
    const cols: string[] = [];
    for (let c = 0; c < columnCount; c++) cols.push(placeholder(paramIndex++));
    tuples.push(`(${cols.join(', ')})`);
  }
  return tuples.join(', ');
}
