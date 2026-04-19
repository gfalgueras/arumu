# Renderer (`src/renderer/`)

Vue 3 SPA inside Electron's `BrowserWindow`. No direct Node.js access — all backend ops go through `window.electronAPI` (injected by preload).

## Root Component: `App.vue`

All top-level state:

| Ref | Type | Purpose |
|---|---|---|
| `servers` | `shallowRef<ServerInfo[]>` | Active servers with DB/table tree |
| `selectedServerName` | `ref<string\|null>` | Focused server |
| `selectedDatabase` | `ref<string\|null>` | Focused database |
| `selectedTable` | `ref<string\|null>` | Focused table |
| `activeTab` | `ref<string>` | Active panel: `'data'`, `'schema'`, `'processes'`, `'variables'`, or query tab UUID |
| `queryTabs` | `ref<QueryTab[]>` | Query editor tabs |
| `sidebarWidth` | `ref<number>` | Sidebar px width (resizable, 5–20% of window) |
| `queryEditorHeight` | `ref<number>` | Query editor panel px height |
| `tableSchemaHeight` | `ref<number>` | Table schema panel px height |

### Selection state flow

- `selectServer(name)` → clears DB and table, leaves data/schema tabs.
- `selectDatabase(serverName, db)` → clears table, leaves data/schema tabs.
- `selectTable(serverName, db, table)` → sets all three, switches to `'schema'` tab.

### State persistence

Deep `watch` saves state after 1-second debounce via `api.saveAppState()`. `initApp()` restores state and silently reconnects servers.

## API Service: `services/api.ts`

Always use this — never call `window.electronAPI` directly in components.

```ts
import { api } from '../services/api';
const result = await api.executeSql(serverName, sql, database);
```

`clean(obj)` is called internally for all write methods — no need to deep-clone before calling `api.*`.

## i18n: `i18n.ts`

```ts
import { $t } from '../i18n';
// Template: {{ $t('section.key') }}
// Script:   const msg = $t('section.key');
```

Supported: `en` (default), `es`, `ca`, `fr`. Locale is reactive — components re-render on language change. Add new keys to **all four** language sections.

## Error Handling: `errorService.ts`

```ts
import { showError } from '../errorService';
showError($t('some.error_title'), optionalDetailMessage);
```

`<ErrorModal />` in `App.vue` is always mounted and reacts to `errorState`.

## Hotkeys: `hotkeys.ts`

- `matchesHotkey(e, hotkeys.closeTab)` — check `KeyboardEvent` against combo string (`'Ctrl+T'`, `'F9'`).
- `toCodeMirrorKey(combo)` — converts to CodeMirror format (`'Ctrl-T'`).
- Defaults: Close Tab = `Shift+W`, Execute All = `F9`, Execute Statement = `Shift+F9`, New Tab = `Ctrl+T`.

## Component Patterns

- Props: components receive `serverName`, `database`, `tableName` as strings.
- Events: emit navigation changes up to `App.vue` — never call `selectTable()` directly from children.
- Never call `window.electronAPI` directly — always use `api.*`.

## Styling

- Tailwind CSS v4 utility classes. No `tailwind.config.js`.
- Dark mode: `dark:` prefix (`dark:bg-slate-900`).
- Accent: `blue-500` / `blue-600`.
- Background: `slate-50` (light) / `slate-950` (dark).
- Card/panel: `slate-100` (light) / `slate-900` (dark).
- Borders: `slate-200` (light) / `slate-800` (dark).

## Key Components

### `DataTable.vue`
Paginated table data with sort, filter, add/edit/delete rows, CSV/SQL export, CSV import. Editing disabled when table has no PRIMARY KEY. Filter: raw `WHERE ...` SQL or freetext LIKE across all columns.

### `TableSchema.vue`
Columns, indexes, FKs. Supports add/edit columns (type, length, nullable, default, unsigned, extra, comment, collation). Diff-based ALTER TABLE SQL preview.

### `QueryEditor.vue`
CodeMirror 6 with SQL language and schema-aware autocomplete. F9 = execute all, Shift+F9 = execute statement at cursor. Results table with EXPLAIN option. Saves to history.

### `ConnectionModal.vue`
Create/edit saved connections. MySQL only (PostgreSQL/SQLite in type but no drivers).
