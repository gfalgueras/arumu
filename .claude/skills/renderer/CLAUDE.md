# Renderer (`src/renderer/`)

The renderer is a **Vue 3 SPA** running inside Electron's `BrowserWindow`. It has no direct Node.js access — all backend operations go through `window.electronAPI` (injected by the preload script).

---

## Entry Point: `main.ts`
Bootstraps the Vue app and mounts to `#app` in `index.html`.

---

## Root Component: `App.vue`

All top-level state lives here:

| Ref | Type | Purpose |
|---|---|---|
| `servers` | `shallowRef<ServerInfo[]>` | Active (connected) servers with their DB/table tree |
| `selectedServerName` | `ref<string\|null>` | Currently focused server |
| `selectedDatabase` | `ref<string\|null>` | Currently focused database |
| `selectedTable` | `ref<string\|null>` | Currently focused table |
| `activeTab` | `ref<string>` | Active content panel (`'data'`, `'schema'`, `'processes'`, `'variables'`, or a query tab ID) |
| `queryTabs` | `ref<QueryTab[]>` | List of query editor tabs |
| `sidebarWidth` | `ref<number>` | Sidebar pixel width (resizable, 5–20% of window) |
| `queryEditorHeight` | `ref<number>` | Query editor panel pixel height |
| `tableSchemaHeight` | `ref<number>` | Table schema panel pixel height |

### State flow for selections
- `selectServer(name)` → clears DB and table, switches away from data/schema tabs.
- `selectDatabase(serverName, db)` → clears table, switches away from data/schema tabs.
- `selectTable(serverName, db, table)` → sets all three, switches to `'schema'` tab.

### State persistence
A deep `watch` in `App.vue` saves all UI state after a 1-second debounce to `api.saveAppState()`. On `initApp()`, state is restored — servers are reconnected silently (without closing the modal).

---

## API Service: `services/api.ts`

Exposes all IPC operations as typed async functions. Always use this — never call `window.electronAPI` directly in components.

```ts
import { api } from '../services/api';
const result = await api.executeSql(serverName, sql, database);
```

**⚠ Important**: Before passing any reactive Vue object (Proxy) or complex object to `api.*`, the service calls `clean(obj)` internally for all write methods. You do NOT need to deep-clone before calling `api.*`.

---

## i18n: `i18n.ts`

```ts
import { $t } from '../i18n';
// In templates: {{ $t('section.key') }}
// In script:    const msg = $t('section.key');
```

Supported languages: `en` (default), `es`, `ca`, `fr`. The current locale is reactive — components re-render automatically on language change.

**When adding a new translation key:**
1. Add under each language section in `i18n.ts`.
2. Adding to only one language will return `undefined` for others.

---

## Error Handling: `errorService.ts`

```ts
import { showError } from '../errorService';
showError($t('some.error_title'), optionalDetailMessage);
```

The `<ErrorModal />` component in `App.vue` is always mounted and listens to `errorState` reactively.

---

## Hotkeys: `hotkeys.ts`

- `hotkeys` reactive object contains the current key combos.
- `matchesHotkey(e, hotkeys.closeTab)` checks a `KeyboardEvent` against a combo string (`'Ctrl+T'`, `'F9'`, etc.).
- `toCodeMirrorKey(combo)` converts the combo to CodeMirror format (`'Ctrl-T'`).
- Defaults: Close Tab = `Shift+W`, Execute All = `F9`, Execute Statement = `Shift+F9`, New Tab = `Ctrl+T`.

---

## Component Development Patterns

### Receiving props
- All components receive `serverName`, `database`, `tableName` as string props for identification.

### Emitting up
- Components emit events to `App.vue` for navigation changes (server/db/table selection).
- Use `defineEmits([...])` — never import the global `api` and call `selectTable()` directly from child components; always emit.

### Styling
- Use **Tailwind CSS v4** utility classes.
- Dark mode variant: `dark:` prefix (e.g., `dark:bg-slate-900`).
- No `tailwind.config.js` — configuration is inline/implicit.
- Primary accent color: **blue-500** / **blue-600**.
- Background palette: `slate-50` (light) / `slate-950` (dark).
- Card/panel: `slate-100` (light) / `slate-900` (dark).
- Borders: `slate-200` (light) / `slate-800` (dark).

### Loading states
Use a local `ref<boolean>` named `isLoading` or a `ref<string[]>` for per-item loading (e.g., `loadingDatabases`).

---

## Key Components

### `DataTable.vue`
- Paginated table data with sort, filter, add/edit/delete rows, CSV/SQL export, CSV import.
- Editing is disabled when no PRIMARY KEY is present on the table.
- Filter input supports both raw `WHERE ...` SQL clauses and freetext search (applied across all columns as LIKE).

### `TableSchema.vue`
- Shows columns, indexes, and foreign keys for the selected table.
- Supports adding/editing columns (with type, length, nullable, default, unsigned, extra, comment, collation).
- Has a diff-based ALTER TABLE SQL preview builder.

### `QueryEditor.vue`
- CodeMirror 6 integration with SQL language support and schema-aware autocomplete.
- Executes the full editor content (F9) or only the statement at the cursor (Shift+F9).
- Results show in a table below the editor with an `EXPLAIN` option.
- Saves executed queries to history.

### `ConnectionModal.vue`
- Used for both creating new and editing existing saved connections.
- Supports MySQL only currently (PostgreSQL/SQLite are in the `ServerInfo.type` type but drivers are not implemented).
