# Main Process (`src/main/`)

This is the **Electron main process** — it runs in Node.js and has full filesystem, crypto, and native OS access.

---

## Entry Point: `index.ts`

### Responsibilities
- Registers all IPC handlers via `ipcMain.handle(...)`.
- Manages `activeServers: ServerInfo[]` — the in-memory list of currently active server connections.
- Persists and loads config files from `~/.arumu/`.
- Creates the `BrowserWindow` and sets the application menu.

### Adding a New IPC Handler

1. Add the handler in `index.ts`:
```ts
ipcMain.handle('api:myNewAction', async (_event, arg1: string) => {
  const server = activeServers.find(s => s.name === arg1);
  if (!server) throw new Error('Server not found');
  const driver = new MySQLDriver();
  try {
    await driver.connect({ ...server.config!, database: 'mydb' });
    return await driver.someMethod();
  } finally {
    await driver.disconnect();
  }
});
```

2. Whitelist the channel in `src/preload/index.ts` (add to `ALLOWED_INVOKE_CHANNELS`).

3. Add a typed wrapper in `src/renderer/services/api.ts`.

### Error Handling in Handlers
- Always throw `Error` objects with user-friendly messages.
- MySQL error codes are mapped in `DB_ERROR_MESSAGES` at the top of `index.ts`. If adding new error scenarios, add codes there.

---

## Database Driver: `drivers/mysql.driver.ts`

### Key Implementation Details

- Uses `mysql2/promise` with a single `Connection` (not a pool).
- `dateStrings: true` is set so DATE/DATETIME values come back as strings (avoids timezone issues).
- **Case-insensitive column access**: `information_schema` queries return columns in different cases depending on MySQL version. Use the `getValue(obj, key)` helper pattern (case-insensitive key lookup) when accessing row fields.

### SQL building helpers
All SQL identifiers (table names, column names, db names) must be escaped:
```ts
const escaped = name.replace(/`/g, '``');
// Use as: `\`${escaped}\``
```

### `getTableData` — filter logic
The filter input supports two modes:
1. **Raw WHERE mode**: if the string contains SQL operators (`=`, `>`, `<`, `LIKE`, `IS NULL`, etc.), it is injected as-is after `WHERE`.
2. **Search mode**: otherwise, a `LIKE %?%` is applied across ALL columns.

### Adding a new driver method
1. Add the method signature to `IDatabaseDriver` in `src/shared/types/database.ts`.
2. Implement the method in `MySQLDriver`.
3. Add a new `ipcMain.handle` in `main/index.ts` that calls it, following the standard connect/disconnect/finally pattern.

### Supported column EXTRA values (allowlist)
```ts
['AUTO_INCREMENT', 'ON UPDATE CURRENT_TIMESTAMP', 'DEFAULT_GENERATED', 'DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP']
```

### Supported FK rules (allowlist)
```ts
['CASCADE', 'NO ACTION', 'RESTRICT', 'SET NULL', 'SET DEFAULT']
```

---

## Config File Paths

```ts
const CONFIG_DIR = path.join(USER_HOME, '.arumu');
// Users: connections.json, state.json, settings.json, query_history.json, snippets.json, error.log
```

### Password Encryption
- Passwords stored with `'enc:' + base64` prefix when `safeStorage.isEncryptionAvailable()` is true.
- Always call `decryptPassword()` after reading from disk, and `encryptPassword()` before writing.

### Query History
- Max 500 entries. Newest first. Each entry: `{ id, sql, database, serverName, executedAt, duration, rowCount?, error? }`.

### Snippet format
```ts
{ id: string, name: string, sql: string }
```
