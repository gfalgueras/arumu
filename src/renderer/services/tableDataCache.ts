import type { TableDataResponse, ColumnInfo, SortConfig } from '@shared/types/database';

export interface CachedTableState {
  data: TableDataResponse | null;
  columnInfo: ColumnInfo[];
  page: number;
  sort: SortConfig[];
  appliedFilter: string;
  columnWidths: Record<string, number>;
}

const cache = new Map<string, CachedTableState>();

export const tableDataCache = {
  get(serverName: string, database: string, table: string): CachedTableState | undefined {
    return cache.get(`${serverName}:${database}:${table}`);
  },
  set(serverName: string, database: string, table: string, state: CachedTableState): void {
    cache.set(`${serverName}:${database}:${table}`, state);
  },
};
