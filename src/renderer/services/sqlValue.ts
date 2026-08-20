/**
 * Value/identifier formatting for the SQL that DataTable builds client-side
 * for cell edits, inserts and deletes.
 *
 * NOTE: this emits MySQL syntax (backtick identifiers, backslash escapes).
 * The same limitation exists wherever the renderer composes SQL itself; the
 * dialect-correct path is to let the driver do it in main, as insertRows()
 * does. Extracted here so there is one place to fix when that happens.
 */

export const escId = (name: string) => '`' + name.replace(/`/g, '``') + '`';

/** Quotes a value, passing through anything that parses as a plain number. */
export const escVal = (val: string | null): string => {
  if (val === null) return 'NULL';
  const n = Number(val);
  if (!isNaN(n) && val.trim() !== '') return val;
  return "'" + val.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
};

const SQL_EXPR_RE = /^(CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|DEFAULT|TRUE|FALSE|NULL)$/i;

/**
 * Whether a typed cell value should be passed through as an expression rather
 * than quoted — bare keywords like CURRENT_TIMESTAMP, or anything containing a
 * call. Deliberately permissive so users can type expressions into cells.
 */
export const isSqlExpr = (val: string) => SQL_EXPR_RE.test(val.trim()) || val.includes('(');

/** escVal, but leaves recognised SQL expressions unquoted. */
export const valOrExpr = (val: string | null): string => {
  if (val === null) return 'NULL';
  if (isSqlExpr(val)) return val;
  return escVal(val);
};

/** RFC-4180-style CSV field quoting. */
export const csvEscape = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
};

/** Renders rows as CSV with a header line. */
export function rowsToCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map(csvEscape).join(',')];
  for (const row of rows) lines.push(columns.map(col => csvEscape(row[col])).join(','));
  return lines.join('\n') + '\n';
}
