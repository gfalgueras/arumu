/**
 * Renderer-side value helpers for the data grid.
 *
 * SQL is no longer composed here — row edits go through the driver via
 * applyRowEdit(), so the statement matches the connected engine's dialect and
 * values are bound rather than interpolated. What remains is UI-level: how to
 * interpret what the user typed, and CSV rendering for the export button.
 */

const SQL_EXPR_RE = /^(CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|DEFAULT|TRUE|FALSE|NULL)$/i;

/**
 * Whether a typed cell value should be sent as SQL rather than a literal —
 * bare keywords like CURRENT_TIMESTAMP, or anything containing a call.
 * Deliberately permissive so users can type expressions into cells.
 */
export const isSqlExpr = (val: string) => SQL_EXPR_RE.test(val.trim()) || val.includes('(');

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
