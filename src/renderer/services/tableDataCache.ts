import type { TableDataResponse, ColumnInfo, SortConfig } from '@shared/types/database';

export interface CachedTableState {
  data: TableDataResponse | null;
  columnInfo: ColumnInfo[];
  page: number;
  sort: SortConfig[];
  appliedFilter: string;
  columnWidths: Record<string, number>;
}

/**
 * Each entry holds a full page of rows, so an unbounded cache grows with every
 * table visited and never shrinks for the life of the session. Capped as an
 * LRU instead: Map preserves insertion order, so re-inserting on read moves an
 * entry to the newest position and the oldest key is the first one out.
 */
const MAX_ENTRIES = 24;

const cache = new Map<string, CachedTableState>();

const keyFor = (serverName: string, database: string, table: string) =>
  `${serverName}:${database}:${table}`;

export const tableDataCache = {
  get(serverName: string, database: string, table: string): CachedTableState | undefined {
    const key = keyFor(serverName, database, table);
    const entry = cache.get(key);
    if (entry) {
      cache.delete(key);
      cache.set(key, entry);
    }
    return entry;
  },

  set(serverName: string, database: string, table: string, state: CachedTableState): void {
    const key = keyFor(serverName, database, table);
    cache.delete(key);
    cache.set(key, state);
    while (cache.size > MAX_ENTRIES) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      cache.delete(oldest.value);
    }
  },

  /** Drops cached pages for a server (all of them if omitted). */
  invalidate(serverName?: string): void {
    if (serverName === undefined) {
      cache.clear();
      return;
    }
    for (const key of [...cache.keys()]) {
      if (key.startsWith(`${serverName}:`)) cache.delete(key);
    }
  },
};
