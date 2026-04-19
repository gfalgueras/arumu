# Shared Types (`src/shared/types/database.ts`)

This module defines the **canonical TypeScript interfaces** shared between the main process and renderer. It is aliased as `@shared` in both `electron-vite` configurations.

---

## Core Interfaces

### `IDatabaseDriver`
The interface all database drivers must implement. Adding new database capabilities requires:
1. Add the method signature here.
2. Implement in `MySQLDriver` (and future drivers).
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
Represents one MySQL table column. Key fields:
- `type`: base type name (`VARCHAR`, `INT`, etc.) — length is extracted separately.
- `length`: length/precision (e.g. `255` for `VARCHAR(255)`, `10,2` for `DECIMAL(10,2)`).
- `unsigned`: derived from `COLUMN_TYPE` containing `'unsigned'`.
- `virtuality`: `'VIRTUAL'` | `'STORED'` | `''` — derived from `EXTRA`.
- `_id`: internal Vue rendering key only (not persisted or sent to driver).

### `AppState`
Persisted UI state. `expandedDatabaseIds` uses format `"serverName:dbName"`. `expandedTableIds` uses `"serverName:dbName:tableName"`.

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
  total: number;      // Total count (for pagination)
}
```

---

## Import Path

```ts
// In main process:
import type { ColumnInfo } from '@shared/types/database';

// In renderer:
import type { ServerInfo } from '@shared/types/database';
```

The `@shared` alias resolves to `src/shared` in both main and renderer vite configurations (defined in `electron.vite.config.ts`).
