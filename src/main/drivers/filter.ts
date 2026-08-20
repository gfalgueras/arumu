/**
 * Decides whether a DataTable filter string is raw SQL or a free-text search.
 *
 * This is a heuristic, and a lossy one: a free-text search for `a=b` or for
 * text containing ` in (` is treated as SQL and injected after WHERE. It is
 * kept because the filter box doubles as a WHERE editor, but it is the reason
 * a search can fail with a syntax error instead of returning no rows.
 *
 * It lived in all five drivers as copy-pasted near-duplicates that had already
 * drifted apart; keeping one copy means the next fix lands everywhere.
 */

const RAW_SQL_MARKERS = [
  '=',
  '>',
  '<',
  ' like ',
  ' is null',
  ' is not null',
  ' between ',
  ' in (',
];

export interface ParsedFilter {
  /** SQL to append (already prefixed with WHERE), or '' when not raw SQL. */
  whereClause: string;
  /** True when the filter should become a LIKE across all columns instead. */
  isSearch: boolean;
}

/**
 * @param extraMarkers dialect-specific operators (e.g. Postgres' ILIKE).
 */
export function parseFilter(filter: string, extraMarkers: string[] = []): ParsedFilter {
  const trimmed = filter.trim();
  const lower = trimmed.toLowerCase();

  const isRaw = lower.startsWith('where ') ||
    RAW_SQL_MARKERS.some(m => lower.includes(m)) ||
    extraMarkers.some(m => lower.includes(m));

  if (!isRaw) return { whereClause: '', isSearch: true };

  return {
    whereClause: lower.startsWith('where ') ? trimmed : `WHERE ${trimmed}`,
    isSearch: false,
  };
}
