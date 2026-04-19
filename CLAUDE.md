# Arumu — SQL Manager

Desktop MySQL management GUI. Stack: **Electron + Vue 3 + TypeScript + Tailwind CSS v4**, built with `electron-vite`, packaged with `pnpm`.

## Project Layout

```
src/
  main/           # Electron main process (Node.js)
    index.ts      # IPC handlers + window creation + file persistence
    drivers/
      mysql.driver.ts   # MySQLDriver — implements IDatabaseDriver
  preload/
    index.ts      # contextBridge — exposes window.electronAPI to renderer
  renderer/       # Vue 3 SPA (browser context)
    App.vue       # Root: state, tab system, sidebar coordination
    components/   # UI components
    services/
      api.ts      # Typed wrappers around window.electronAPI.invoke(...)
    i18n.ts       # Translations (en, es, ca, fr)
    hotkeys.ts    # Configurable keyboard shortcuts
    errorService.ts
  shared/
    types/
      database.ts # Shared TypeScript interfaces (IDatabaseDriver, etc.)
```

## IPC Architecture

All DB work runs in main process via `ipcMain.handle('api:<name>', ...)`. Preload whitelists channels and exposes `window.electronAPI.invoke(channel, ...args)`. Renderer calls through `src/renderer/services/api.ts`.

**Adding a new IPC channel requires changes in THREE places:**
1. `src/main/index.ts` — handler
2. `src/preload/index.ts` — add to `ALLOWED_INVOKE_CHANNELS`
3. `src/renderer/services/api.ts` — typed wrapper

## Database Driver Pattern

- All drivers implement `IDatabaseDriver` (`src/shared/types/database.ts`).
- Only `MySQLDriver` exists currently (`mysql2/promise`, single connection, not pooled).
- Each IPC handler: instantiate driver → `connect()` → do work → `disconnect()` in `finally`.
- Active server metadata in `activeServers: ServerInfo[]` array in `main/index.ts`.

## Data Serialization for IPC

Vue Proxy objects and BigInt values cannot cross IPC boundary.
- `api.ts` calls `clean()` (`JSON.parse(JSON.stringify(obj))`) before sending objects to main.
- Driver's `getTableData` and `executeQuery` also sanitize with a BigInt replacer.

## Password Encryption

Passwords encrypted with Electron's `safeStorage`. Format: `enc:<base64>`. Helpers: `encryptPassword`/`decryptPassword` in `main/index.ts`.

## Persistence Files (`~/.arumu/`)

| File | Purpose |
|---|---|
| `connections.json` | Saved server configs (passwords encrypted) |
| `state.json` | UI state restored on startup |
| `settings.json` | Language, theme, hotkeys |
| `query_history.json` | Last 500 executed queries |
| `snippets.json` | User-saved SQL snippets |
| `error.log` | Errors from main + renderer |

## SQL Identifier Escaping

Always escape MySQL identifiers with backticks:
```ts
const escaped = name.replace(/`/g, '``');
// Use as: `\`${escaped}\``
```

## i18n

All user-visible strings must use `$t('section.key')`. Add new keys to **all four language sections** in `i18n.ts`.

## Theming

Tailwind CSS v4 via `@tailwindcss/vite` (no `tailwind.config.js`). Dark mode uses `dark:` class variant on `document.documentElement`.

## Error Handling

- Renderer: `showError(title, message)` from `errorService.ts` → triggers `<ErrorModal />`.
- Main: MySQL error codes mapped in `DB_ERROR_MESSAGES`.
- All errors also written to `~/.arumu/error.log`.

## Commands

```bash
pnpm dev        # Electron dev server (hot reload)
pnpm build      # Production bundle
pnpm typecheck  # vue-tsc type checking
pnpm test       # vitest
pnpm lint       # ESLint on src/renderer
```

## Component Map

| Component | Purpose |
|---|---|
| `App.vue` | Root: tab system, server/db/table state, layout |
| `Sidebar.vue` | Server/DB/table tree navigation |
| `DataTable.vue` | Paginated editable table, filter/sort/export/import |
| `TableSchema.vue` | Column editor, indexes, FKs, ALTER SQL preview |
| `QueryEditor.vue` | CodeMirror SQL editor, multi-tab, history |
| `ConnectionModal.vue` | Add/edit saved server connections |
| `SettingsModal.vue` | Language, theme, hotkey config |
| `ProcessList.vue` | SHOW PROCESSLIST with kill + auto-refresh |
| `ServerVariables.vue` | SHOW VARIABLES / SHOW GLOBAL STATUS |
| `QueryHistoryPanel.vue` | Browse and re-use past queries |
| `QuerySnippetsPanel.vue` | Save/insert/delete SQL snippets |
| `CsvImportModal.vue` | CSV file picker with column mapping |
| `ErrorModal.vue` | Global error dialog |

## Active Tab System

`activeTab` in `App.vue`:
- `'data'` — DataTable (requires `selectedTable`)
- `'schema'` — TableSchema (requires `selectedTable`)
- `'processes'` — ProcessList
- `'variables'` — ServerVariables
- `<uuid>` — Query editor tab

`lastActiveQueryTabId` tracks last focused query tab.

## State Persistence

Deep `watch` in `App.vue` saves UI state with 1-second debounce via `api.saveAppState()`. Restored in `initApp()` on startup, which also silently reconnects active servers.
