# Main Process (`src/main/`)

Runs in Node.js — full filesystem, crypto, and native OS access.

## `index.ts` Responsibilities

- Registers all IPC handlers via `ipcMain.handle(...)`.
- Manages `activeServers: ServerInfo[]` — in-memory list of active server connections.
- Persists/loads config files from `~/.arumu/`.
- Creates `BrowserWindow` and sets application menu.

## Adding a New IPC Handler

```ts
// 1. index.ts
ipcMain.handle('api:myNewAction', async (_event, serverName: string) => {
  const server = activeServers.find(s => s.name === serverName);
  if (!server) throw new Error('Server not found');
  const driver = new MySQLDriver();
  try {
    await driver.connect({ ...server.config!, database: 'mydb' });
    return await driver.someMethod();
  } finally {
    await driver.disconnect();
  }
});

// 2. src/preload/index.ts — add 'api:myNewAction' to ALLOWED_INVOKE_CHANNELS
// 3. src/renderer/services/api.ts — add typed wrapper
```

## Error Handling

Always throw `Error` objects with user-friendly messages. MySQL error codes mapped in `DB_ERROR_MESSAGES` at top of `index.ts`.

## `drivers/mysql.driver.ts`

- `mysql2/promise` with single `Connection` (not a pool).
- `dateStrings: true` — DATE/DATETIME come back as strings (avoids timezone issues).
- **Case-insensitive column access**: `information_schema` returns columns in different cases by MySQL version. Use `getValue(obj, key)` helper for case-insensitive key lookup.

### `getTableData` filter logic

1. **Raw WHERE mode**: string contains SQL operators (`=`, `>`, `<`, `LIKE`, `IS NULL`, etc.) → injected as-is after `WHERE`.
2. **Search mode**: otherwise → `LIKE %?%` across ALL columns.

### Adding a new driver method

1. Add signature to `IDatabaseDriver` in `src/shared/types/database.ts`.
2. Implement in `MySQLDriver`.
3. Add `ipcMain.handle` in `index.ts` using connect/disconnect/finally pattern.

### Allowlists

Column EXTRA values:
```ts
['AUTO_INCREMENT', 'ON UPDATE CURRENT_TIMESTAMP', 'DEFAULT_GENERATED', 'DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP']
```

FK rules:
```ts
['CASCADE', 'NO ACTION', 'RESTRICT', 'SET NULL', 'SET DEFAULT']
```

## Config Files (`~/.arumu/`)

- `connections.json` — passwords stored as `'enc:' + base64` (when `safeStorage.isEncryptionAvailable()`). Always call `decryptPassword()` after read, `encryptPassword()` before write.
- `query_history.json` — max 500 entries, newest first. Schema: `{ id, sql, database, serverName, executedAt, duration, rowCount?, error? }`.
- `snippets.json` — schema: `{ id: string, name: string, sql: string }`.
