# Shared Types (`src/shared/types/database.ts`)

Canonical TypeScript interfaces shared between main process and renderer. Aliased as `@shared` in both electron-vite configs.

## Import Path

```ts
// Main process:
import type { ColumnInfo } from '@shared/types/database';
// Renderer:
import type { ServerInfo } from '@shared/types/database';
```

## Core Interfaces

### `IDatabaseDriver`
Interface all drivers must implement. Adding new DB capabilities:
1. Add method signature here.
2. Implement in `MySQLDriver`.
3. Expose via IPC in `main/index.ts`.

### `ConnectionConfig`
```ts
interface ConnectionConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database?: string;
  defaultFilter?: string; // Comma-separated DB names to hide from sidebar
}
```

### `ColumnInfo`
One MySQL table column. Key fields:
- `type`: base type name (`VARCHAR`, `INT`) — length extracted separately.
- `length`: length/precision (`255` for `VARCHAR(255)`, `10,2` for `DECIMAL(10,2)`).
- `unsigned`: derived from `COLUMN_TYPE` containing `'unsigned'`.
- `virtuality`: `'VIRTUAL'` | `'STORED'` | `''` — derived from `EXTRA`.
- `_id`: internal Vue rendering key only (not persisted or sent to driver).

### `AppState`
Persisted UI state. `expandedDatabaseIds` format: `"serverName:dbName"`. `expandedTableIds` format: `"serverName:dbName:tableName"`.

### `AppSettings`
```ts
interface AppSettings {
  language?: string;      // 'auto' | 'en' | 'es' | 'ca' | 'fr'
  theme?: 'system' | 'light' | 'dark';
  hotkeys?: Partial<HotkeyMap>;
}
```

### `TableDataResponse`
```ts
interface TableDataResponse {
  columns: string[];  // Ordered column names
  rows: any[];        // Data rows keyed by column name
  total: number;      // Total count for pagination
}
```
