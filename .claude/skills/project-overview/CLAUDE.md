# Arumu — SQL Manager (Agent Reference)

Arumu is a **desktop MySQL management GUI** built with **Electron + Vue 3 + TypeScript + Tailwind CSS v4**, using `electron-vite` as the build system and `pnpm` as the package manager.

---

## Project Layout

```
src/
  main/           # Electron main process (Node.js)
    index.ts      # All IPC handlers + window creation + file persistence
    drivers/
      mysql.driver.ts   # MySQLDriver — implements IDatabaseDriver
  preload/
    index.ts      # contextBridge — exposes window.electronAPI to renderer
  renderer/       # Vue 3 SPA (browser context)
    App.vue       # Root component — state, tab system, sidebar coordination
    components/   # All UI components
    services/
      api.ts      # Thin wrapper around window.electronAPI.invoke(...)
    i18n.ts       # Translation system (en, es, ca, fr)
    hotkeys.ts    # Configurable keyboard shortcuts
    errorService.ts # Reactive global error modal state
  shared/
    types/
      database.ts # All shared TypeScript interfaces (IDatabaseDriver, etc.)
```

---

## Key Conventions

### IPC Architecture
- All DB work runs in **main process** (`src/main/index.ts`) via `ipcMain.handle('api:<name>', ...)`.
- The **preload** (`src/preload/index.ts`) whitelists channels and exposes `window.electronAPI.invoke(channel, ...args)`.
- The **renderer** calls through `src/renderer/services/api.ts` which wraps every channel as a typed function.
- **Adding a new IPC channel** requires changes in THREE places: `main/index.ts`, `preload/index.ts`, and `renderer/services/api.ts`.

### Database Driver Pattern
- All drivers implement `IDatabaseDriver` (`src/shared/types/database.ts`).
- Currently only `MySQLDriver` (`src/main/drivers/mysql.driver.ts`) exists, using `mysql2/promise`.
- Each IPC handler instantiates a **fresh `MySQLDriver`**, calls `connect()`, does work, then calls `disconnect()` in `finally`.
- Connections are **not pooled** — each request opens and closes a connection.
- Active server metadata (name, type, databases list) is stored in the `activeServers: ServerInfo[]` in-memory array in `main/index.ts`.

### Data Serialization for IPC
- Vue Proxy objects and BigInt values cannot cross the IPC boundary.
- The renderer's `api.ts` uses a `clean()` helper (`JSON.parse(JSON.stringify(obj))`) before sending objects to main.
- The driver's `getTableData` and `executeQuery` also sanitize using `JSON.parse(JSON.stringify(...))` with a BigInt replacer.

### Password Encryption
- Passwords are encrypted with Electron's `safeStorage` before writing to `connections.json`.
- Format: `enc:<base64>` — the `encryptPassword`/`decryptPassword` helpers in `main/index.ts` handle this.

### Persistence Files (in `~/.arumu/`)
| File | Purpose |
|---|---|
| `connections.json` | Saved server configs (passwords encrypted) |
| `state.json` | UI state restored on startup (tabs, selection, sizes) |
| `settings.json` | Language, theme, hotkeys |
| `query_history.json` | Last 500 executed queries |
| `snippets.json` | User-saved SQL snippets |
| `error.log` | Appended error log from main + renderer |

### i18n
- All user-visible strings must use `$t('section.key')` in templates or `$t(...)` imported from `src/renderer/i18n.ts`.
- Supported languages: `en`, `es`, `ca`, `fr`.
- `'auto'` locale resolves via `navigator.language`.
- When adding a new string, add it to **all four language sections** in `i18n.ts`.

### Theming
- Uses **Tailwind CSS v4** via `@tailwindcss/vite` plugin (no `tailwind.config.js`).
- Dark mode uses the `dark:` variant with class strategy (`document.documentElement.classList`).
- Theme setting: `'system' | 'light' | 'dark'` stored in `settings.json`.

### Error Handling
- Renderer errors are shown via `showError(title, message)` from `src/renderer/errorService.ts`.
- Main process errors are mapped through `DB_ERROR_MESSAGES` (MySQL error codes → friendly strings).
- All errors are also written to `~/.arumu/error.log`.

---

## Running the App

```bash
pnpm dev        # Start Electron dev server (hot reload)
pnpm build      # Build production bundle
pnpm typecheck  # Run vue-tsc type checking
pnpm test       # Run vitest tests
pnpm lint       # ESLint on src/renderer
```

---

## SQL Identifier Escaping
Always escape MySQL identifiers with backticks using the pattern:
```ts
const escapedId = identifier.replace(/`/g, '``');
const quoted = `\`${escapedId}\``;
```

---

## Component Map

| Component | Purpose |
|---|---|
| `App.vue` | Root: tab system, server/db/table selection state, sidebar/main layout |
| `Sidebar.vue` | Server/DB/table tree navigation |
| `DataTable.vue` | Paginated editable table view with filter/sort/export/import |
| `TableSchema.vue` | Column editor, indexes, FKs, CREATE/ALTER SQL, maintenance ops |
| `QueryEditor.vue` | CodeMirror SQL editor with multi-tab execution and history |
| `ConnectionModal.vue` | Add/edit saved server connections |
| `SettingsModal.vue` | Language, theme, hotkey configuration |
| `ProcessList.vue` | MySQL SHOW PROCESSLIST with kill + auto-refresh |
| `ServerVariables.vue` | SHOW VARIABLES / SHOW GLOBAL STATUS display |
| `QueryHistoryPanel.vue` | Browse and re-use past queries |
| `QuerySnippetsPanel.vue` | Save/insert/delete SQL snippets |
| `CsvImportModal.vue` | CSV file picker with column mapping and row import |
| `ErrorModal.vue` | Global error dialog driven by `errorService.ts` |

---

## Active Tab System
`activeTab` in `App.vue` is a string that is one of:
- `'data'` — DataTable view (requires `selectedTable`)
- `'schema'` — TableSchema view (requires `selectedTable`)
- `'processes'` — ProcessList
- `'variables'` — ServerVariables
- `<queryTabId>` — A query editor tab (UUID string)

`lastActiveQueryTabId` tracks the last focused query tab so navigation to data/schema can return to it.

---

## State Persistence Pattern
All UI state is automatically saved with a **1-second debounce** via a deep `watch` in `App.vue`. State is restored in `initApp()` on startup, which also reconnects previously active servers.
