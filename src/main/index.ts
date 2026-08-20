import { app, BrowserWindow, ipcMain, Menu, safeStorage, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { MySQLDriver } from './drivers/mysql.driver';
import { PostgreSQLDriver } from './drivers/postgres.driver';
import { SQLiteDriver } from './drivers/sqlite.driver';
import { SQLServerDriver } from './drivers/sqlserver.driver';
import { OracleDriver } from './drivers/oracle.driver';
import type {
  IDatabaseDriver, ServerInfo, StoredServer, TableInfo, ColumnInfo, TableIndex,
  ForeignKey, SortConfig, AppState, AppSettings, QueryHistoryEntry, QuerySnippet,
} from '../shared/types/database';

function createDriver(server: { type: 'mysql' | 'postgres' | 'sqlite' | 'sqlserver' | 'oracle' }): IDatabaseDriver {
  switch (server.type) {
    case 'postgres':
      return new PostgreSQLDriver();
    case 'sqlite':
      return new SQLiteDriver();
    case 'sqlserver':
      return new SQLServerDriver();
    case 'oracle':
      return new OracleDriver();
    case 'mysql':
    default:
      return new MySQLDriver();
  }
}

const DB_ERROR_MESSAGES: Record<string, string> = {
  ECONNREFUSED: 'Connection refused. Check host and port.',
  ETIMEDOUT: 'Connection timed out. Check host and firewall.',
  ENOTFOUND: 'Host not found. Check the hostname.',
  ECONNRESET: 'Connection reset by server.',
  ER_ACCESS_DENIED_ERROR: 'Access denied. Check username and password.',
  ER_DBACCESS_DENIED_ERROR: 'Access denied to database.',
  ER_BAD_DB_ERROR: 'Database does not exist.',
  ER_NOT_SUPPORTED_AUTH_MODE: 'Authentication method not supported. Try a different auth plugin.',
  PROTOCOL_CONNECTION_LOST: 'Connection lost.',
  ER_CON_COUNT_ERROR: 'Too many connections on the server.',
};

// Define the connections file path in the user's home directory
const USER_HOME = process.env.HOME || process.env.USERPROFILE || '';
const CONFIG_DIR = path.join(USER_HOME, '.arumu');
const CONNECTIONS_FILE = path.join(CONFIG_DIR, 'connections.json');
const APP_STATE_FILE = path.join(CONFIG_DIR, 'state.json');
const APP_SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');
const ERROR_LOG_FILE = path.join(CONFIG_DIR, 'error.log');
const QUERY_HISTORY_FILE = path.join(CONFIG_DIR, 'query_history.json');
const OLD_CONNECTIONS_FILE = path.join(process.cwd(), 'connections.json');

// Ensure directory exists
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

const writeErrorLog = (source: string, message: string, stack?: string) => {
  const ts = new Date().toISOString();
  const entry = `[${ts}] [${source}] ${message}${stack ? '\n' + stack : ''}\n`;
  try {
    fs.appendFileSync(ERROR_LOG_FILE, entry, 'utf8');
  } catch { /* ignore log write failures */ }
};

const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  originalConsoleError(...args);
  writeErrorLog('main', args.map(a => a instanceof Error ? a.message : String(a)).join(' '),
    args.find(a => a instanceof Error)?.stack);
};

process.on('uncaughtException', (err) => {
  writeErrorLog('uncaughtException', err.message, err.stack);
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  writeErrorLog('unhandledRejection', err.message, err.stack);
});

// Migrate old connections if they exist
if (fs.existsSync(OLD_CONNECTIONS_FILE) && !fs.existsSync(CONNECTIONS_FILE)) {
  try {
    fs.renameSync(OLD_CONNECTIONS_FILE, CONNECTIONS_FILE);
    console.log('Migrated connections to:', CONNECTIONS_FILE);
  } catch (err) {
    console.error('Failed to migrate connections:', err);
  }
}

const encryptPassword = (password: string): string => {
  if (safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(password).toString('base64');
  }
  return password;
};

const decryptPassword = (value: string): string => {
  if (value.startsWith('enc:') && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
    } catch {
      return value;
    }
  }
  return value;
};

// Helper to read/write connections
const getStoredServers = (): StoredServer[] => {
  if (!fs.existsSync(CONNECTIONS_FILE)) {
    return [];
  }
  try {
    const servers: StoredServer[] = JSON.parse(fs.readFileSync(CONNECTIONS_FILE, 'utf-8'));
    return servers.map(s => ({
      ...s,
      config: s.config ? { ...s.config, password: decryptPassword(s.config.password || '') } : s.config
    }));
  } catch (e) {
    console.error('Failed to read connections file:', e);
    return [];
  }
};

const saveStoredServers = (servers: StoredServer[]) => {
  const encrypted = servers.map(s => ({
    ...s,
    config: s.config ? { ...s.config, password: encryptPassword(s.config.password || '') } : s.config
  }));
  fs.writeFileSync(CONNECTIONS_FILE, JSON.stringify(encrypted, null, 2));
};

const getAppState = (): AppState | null => {
  if (!fs.existsSync(APP_STATE_FILE)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(APP_STATE_FILE, 'utf-8'));
  } catch (e) {
    console.error('Failed to read app state file:', e);
    return null;
  }
};

const saveAppState = (state: AppState) => {
  fs.writeFileSync(APP_STATE_FILE, JSON.stringify(state, null, 2));
};

const getQueryHistory = (): QueryHistoryEntry[] => {
  if (!fs.existsSync(QUERY_HISTORY_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(QUERY_HISTORY_FILE, 'utf-8')); }
  catch { return []; }
};

const addToQueryHistory = (entry: QueryHistoryEntry) => {
  const history = [entry, ...getQueryHistory()].slice(0, 500);
  fs.writeFileSync(QUERY_HISTORY_FILE, JSON.stringify(history, null, 2));
};

const getAppSettings = (): AppSettings => {
  if (!fs.existsSync(APP_SETTINGS_FILE)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(APP_SETTINGS_FILE, 'utf-8'));
  } catch (_e) {
    return {};
  }
};

const saveAppSettings = (settings: AppSettings) => {
  fs.writeFileSync(APP_SETTINGS_FILE, JSON.stringify(settings, null, 2));
};

// Servidores activos (en memoria)
let activeServers: ServerInfo[] = [];
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const queryLogHandler = (sql: string, durationMs: number, error?: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('query:log', { sql, durationMs, error });
    }
  };
  MySQLDriver.queryLogger = queryLogHandler;
  PostgreSQLDriver.queryLogger = queryLogHandler;
  SQLiteDriver.queryLogger = queryLogHandler;
  SQLServerDriver.queryLogger = queryLogHandler;
  OracleDriver.queryLogger = queryLogHandler;

  mainWindow.on('closed', () => { mainWindow = null; });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  // Set up application menu
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => {
            app.quit();
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // IPC Handlers
  ipcMain.handle('api:getServers', () => {
    return activeServers.map(s => ({
      name: s.name,
      type: s.type
    }));
  });

  ipcMain.handle('api:getDatabases', async (_event, serverName: string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');

    const driver = createDriver(server);
    try {
      if (server.databases && server.databases.length > 0) {
        return server.databases;
      }

      if (server.config) {
        await driver.connect(server.config);
        let databases = await driver.getDatabases();

        if (server.config.defaultFilter) {
          const filters = server.config.defaultFilter.split(',').map(f => f.trim().toLowerCase());
          databases = databases.filter(db => !filters.includes(db.name.toLowerCase()));
        }

        const seen = new Set<string>();
        databases = databases.filter(db => seen.has(db.name) ? false : (seen.add(db.name), true));
        server.databases = databases;
        return databases;
      } else {
        throw new Error('Server configuration missing');
      }
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:getTables', async (_event, serverName: string, dbName: string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');

    const driver = createDriver(server);
    try {
      const db = server.databases?.find(d => d.name === dbName);
      if (db && db.tables && db.tables.length > 0) {
        return db.tables;
      }

      let tables: TableInfo[] = [];
      if (server.config) {
        const config = { ...server.config, database: dbName };
        await driver.connect(config);
        tables = await driver.getTables(dbName);
      } else {
        throw new Error('Server configuration missing');
      }

      const size = tables.reduce((acc, t) => acc + (Number(t.size) || 0), 0);
      if (db) {
        db.tables = tables;
        db.size = size;
      } else if (server.databases) {
        const existing = server.databases.find(d => d.name === dbName);
        if (existing) {
          existing.tables = tables;
          existing.size = size;
        } else {
          server.databases.push({ name: dbName, tables, size });
        }
      } else {
        server.databases = [{ name: dbName, tables, size }];
      }

      return tables;
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:getSchema', async (_event, serverName: string, dbName: string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');

    const driver = createDriver(server);
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        return await driver.getSchema(dbName);
      }
      throw new Error('Server configuration missing');
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:connect', async (_event, storedServer: StoredServer) => {
    const driver = createDriver(storedServer);
    try {
      if (!storedServer || !storedServer.config) {
        throw new Error('Server configuration missing or invalid');
      }

      const alreadyActive = activeServers.find(s => s.name === storedServer.name);
      if (!alreadyActive) {
        await driver.connect(storedServer.config);
      }

      const newActiveServer: ServerInfo = {
        ...storedServer,
        databases: alreadyActive ? alreadyActive.databases : []
      };

      if (!alreadyActive) {
        activeServers.push(newActiveServer);
      }
      return newActiveServer;
    } catch (err) {
      console.error('[api:connect] Error:', err);
      const dbErr = err as { code?: string; sqlMessage?: string; message?: string };
      const friendly = dbErr?.code ? DB_ERROR_MESSAGES[dbErr.code] : null;
      const msg = friendly
        ? `${friendly} (${dbErr.code})`
        : ([dbErr?.code, dbErr?.sqlMessage || (dbErr?.message !== dbErr?.code ? dbErr?.message : null)].filter(Boolean).join(': ') || String(err) || 'Connection failed');
      throw new Error(msg);
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:disconnectServer', (_event, name: string) => {
    activeServers = activeServers.filter(s => s.name !== name);
  });

  ipcMain.handle('api:getStoredServers', () => getStoredServers());

  ipcMain.handle('api:saveStoredServer', (_event, newServer: StoredServer) => {
    const servers = getStoredServers();
    if (servers.find(s => s.name === newServer.name)) {
      throw new Error('Ya existe un servidor con este nombre');
    }
    servers.push(newServer);
    saveStoredServers(servers);
    return newServer;
  });

  ipcMain.handle('api:updateStoredServer', (_event, name: string, updatedServer: StoredServer) => {
    const servers = getStoredServers();
    const index = servers.findIndex(s => s.name === name);
    if (index === -1) throw new Error('Server not found');

    servers[index] = updatedServer;
    saveStoredServers(servers);

    const activeIndex = activeServers.findIndex(s => s.name === name);
    if (activeIndex !== -1) {
      activeServers[activeIndex] = { ...updatedServer, databases: [] };
    }
    return servers[index];
  });

  ipcMain.handle('api:getAppState', () => getAppState());
  ipcMain.handle('api:saveAppState', (_event, state: AppState) => saveAppState(state));
  ipcMain.handle('api:getAppSettings', () => getAppSettings());
  ipcMain.handle('api:saveAppSettings', (_event, settings: AppSettings) => saveAppSettings(settings));

  ipcMain.handle('log:error', (_event, message: string, stack?: string) => {
    writeErrorLog('renderer', message, stack);
  });

  ipcMain.handle('api:getTableData', async (_event, serverName: string, dbName: string, tableName: string, options: { limit: number; offset: number; sort?: SortConfig[]; filter?: string }) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');

    const driver = createDriver(server);
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        return await driver.getTableData(dbName, tableName, options.limit, options.offset, options.sort, options.filter);
      }
      throw new Error('Server configuration missing');
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:getTableColumns', async (_event, serverName: string, dbName: string, tableName: string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');

    const driver = createDriver(server);
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        return await driver.getTableColumns(dbName, tableName);
      }
      throw new Error('Server configuration missing');
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:getTableIndexes', async (_event, serverName: string, dbName: string, tableName: string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    const driver = createDriver(server);
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        return await driver.getTableIndexes(dbName, tableName);
      }
      throw new Error('Server configuration missing');
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:addIndex', async (_event, serverName: string, dbName: string, tableName: string, index: TableIndex) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    const driver = createDriver(server);
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        await driver.addIndex(dbName, tableName, index);
      } else throw new Error('Server configuration missing');
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:dropIndex', async (_event, serverName: string, dbName: string, tableName: string, indexName: string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    const driver = createDriver(server);
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        await driver.dropIndex(dbName, tableName, indexName);
      } else throw new Error('Server configuration missing');
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:getTableForeignKeys', async (_event, serverName: string, dbName: string, tableName: string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    const driver = createDriver(server);
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        return await driver.getTableForeignKeys(dbName, tableName);
      }
      throw new Error('Server configuration missing');
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:addForeignKey', async (_event, serverName: string, dbName: string, tableName: string, fk: ForeignKey) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    const driver = createDriver(server);
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        await driver.addForeignKey(dbName, tableName, fk);
      } else throw new Error('Server configuration missing');
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:dropForeignKey', async (_event, serverName: string, dbName: string, tableName: string, fkName: string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    const driver = createDriver(server);
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        await driver.dropForeignKey(dbName, tableName, fkName);
      } else throw new Error('Server configuration missing');
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:addColumn', async (_event, serverName: string, dbName: string, tableName: string, column: ColumnInfo, afterColumn?: string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    const driver = createDriver(server);
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        await driver.addColumn(dbName, tableName, column, afterColumn);
      } else throw new Error('Server configuration missing');
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:updateColumn', async (_event, serverName: string, dbName: string, tableName: string, oldName: string, column: ColumnInfo, afterColumn?: string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    const driver = createDriver(server);
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        await driver.updateColumn(dbName, tableName, oldName, column, afterColumn);
      } else throw new Error('Server configuration missing');
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:getTableCreateStatement', async (_event, serverName: string, dbName: string, tableName: string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    const driver = createDriver(server);
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        const statement = await driver.getTableCreateStatement(dbName, tableName);
        return { statement };
      }
      throw new Error('Server configuration missing');
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:executeSql', async (_event, serverName: string, sql: string, database: string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    const driver = createDriver(server);
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: database || server.config.database });
        return await driver.executeQuery(sql);
      }
      throw new Error('Server configuration missing');
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:getSupportedTypes', (_event, serverName: string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    return createDriver(server).getSupportedTypes();
  });

  // Table maintenance
  ipcMain.handle('api:tableMaintenanceOp', async (_event, serverName: string, dbName: string, tableName: string, op: string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    const driver = createDriver(server);
    const allowedOps = driver.getCapabilities().maintenanceOps;
    if (!allowedOps.includes(op.toUpperCase())) throw new Error('Invalid operation');
    try {
      await driver.connect({ ...server.config!, database: dbName });
      return await driver.runTableMaintenance(dbName, tableName, op);
    } finally {
      await driver.disconnect();
    }
  });

  // Server variables
  ipcMain.handle('api:getServerVariables', async (_event, serverName: string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    const driver = createDriver(server);
    try {
      await driver.connect(server.config!);
      return await driver.getServerVariables();
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:getServerCapabilities', (_event, serverName: string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    return createDriver(server).getCapabilities();
  });

  // CSV import — read file, return content
  ipcMain.handle('api:openFileDialog', async (_event, filters: Electron.FileFilter[]) => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters,
    });
    if (canceled || !filePaths[0]) return null;
    const content = fs.readFileSync(filePaths[0], 'utf-8');
    return { filePath: filePaths[0], content };
  });

  // Snippets
  const SNIPPETS_FILE = path.join(CONFIG_DIR, 'snippets.json');
  const getSnippets = (): QuerySnippet[] => {
    if (!fs.existsSync(SNIPPETS_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(SNIPPETS_FILE, 'utf-8')); }
    catch { return []; }
  };
  ipcMain.handle('api:getSnippets', () => getSnippets());
  ipcMain.handle('api:saveSnippet', (_event, snippet: QuerySnippet) => {
    const snippets = [snippet, ...getSnippets().filter(s => s.id !== snippet.id)];
    fs.writeFileSync(SNIPPETS_FILE, JSON.stringify(snippets, null, 2));
  });
  ipcMain.handle('api:deleteSnippet', (_event, id: string) => {
    const snippets = getSnippets().filter(s => s.id !== id);
    fs.writeFileSync(SNIPPETS_FILE, JSON.stringify(snippets, null, 2));
  });

  ipcMain.handle('api:getQueryHistory', () => getQueryHistory());

  ipcMain.handle('api:addQueryHistory', (_event, entry: QueryHistoryEntry) => {
    addToQueryHistory(entry);
  });

  ipcMain.handle('api:clearQueryHistory', () => {
    fs.writeFileSync(QUERY_HISTORY_FILE, '[]');
  });

  ipcMain.handle('api:getProcessList', async (_event, serverName: string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    const driver = createDriver(server);
    try {
      await driver.connect(server.config!);
      return await driver.getProcessList();
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:killProcess', async (_event, serverName: string, processId: number | string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    const driver = createDriver(server);
    try {
      await driver.connect(server.config!);
      await driver.killProcess(processId);
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:saveExportFile', async (_event, defaultFilename: string, content: string, filters: Electron.FileFilter[]) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Save Export',
      defaultPath: defaultFilename,
      filters,
    });
    if (canceled || !filePath) return { saved: false };
    fs.writeFileSync(filePath, content, 'utf-8');
    return { saved: true, filePath };
  });

  ipcMain.handle('api:exportTableData', async (_event, serverName: string, dbName: string, tableName: string, format: 'csv' | 'sql', filter: string, sort: SortConfig[]) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');

    const ext = format === 'csv' ? 'csv' : 'sql';
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: `Export ${tableName}`,
      defaultPath: `${tableName}.${ext}`,
      filters: format === 'csv'
        ? [{ name: 'CSV Files', extensions: ['csv'] }]
        : [{ name: 'SQL Files', extensions: ['sql'] }],
    });
    if (canceled || !filePath) return { saved: false };

    const driver = createDriver(server);
    try {
      await driver.connect({ ...server.config!, database: dbName });
      let allRows: Record<string, unknown>[] = [];
      let columns: string[] = [];
      let offset = 0;
      const chunk = 1000;
      while (true) {
        const result = await driver.getTableData(dbName, tableName, chunk, offset, sort, filter);
        if (columns.length === 0) columns = result.columns;
        allRows = allRows.concat(result.rows);
        if (allRows.length >= result.total || result.rows.length === 0) break;
        offset += chunk;
      }

      const escId = (s: string) => driver.escapeIdentifier(s);
      const escVal = (val: unknown): string => {
        if (val === null) return 'NULL';
        if (typeof val === 'number') return String(val);
        if (typeof val === 'boolean') return val ? '1' : '0';
        return driver.escapeStringLiteral(String(val));
      };
      const escCsv = (val: unknown): string => {
        if (val === null) return '';
        const s = String(val);
        if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };

      let content = '';
      if (format === 'csv') {
        content = columns.map(escCsv).join(',') + '\n';
        for (const row of allRows) {
          content += columns.map(col => escCsv(row[col])).join(',') + '\n';
        }
      } else {
        const colList = columns.map(escId).join(', ');
        content = `-- Export of ${driver.escapeIdentifier(dbName)}.${driver.escapeIdentifier(tableName)}\n-- Generated by Arumu\n\n`;
        for (const row of allRows) {
          const vals = columns.map(col => escVal(row[col])).join(', ');
          content += `INSERT INTO ${escId(tableName)} (${colList}) VALUES (${vals});\n`;
        }
      }

      fs.writeFileSync(filePath, content, 'utf-8');
      return { saved: true, filePath };
    } finally {
      await driver.disconnect();
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
