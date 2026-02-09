import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'path';
import fs from 'fs';
import { MySQLDriver } from '../backend/src/drivers/mysql.driver';
import type { ServerInfo, StoredServer, DatabaseInfo } from '../shared/types/database';

// Soporte para serializar BigInt en JSON (Electron/Node)
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// Define the connections file path in the user's home directory
const USER_HOME = process.env.HOME || process.env.USERPROFILE || '';
const CONFIG_DIR = path.join(USER_HOME, '.sqlmanager');
const CONNECTIONS_FILE = path.join(CONFIG_DIR, 'connections.json');
const APP_STATE_FILE = path.join(CONFIG_DIR, 'state.json');
const APP_SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');
const OLD_CONNECTIONS_FILE = path.join(process.cwd(), 'connections.json');

// Ensure directory exists
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Migrate old connections if they exist
if (fs.existsSync(OLD_CONNECTIONS_FILE) && !fs.existsSync(CONNECTIONS_FILE)) {
  try {
    fs.renameSync(OLD_CONNECTIONS_FILE, CONNECTIONS_FILE);
    console.log('Migrated connections to:', CONNECTIONS_FILE);
  } catch (err) {
    console.error('Failed to migrate connections:', err);
  }
}

// Helper to read/write connections
const getStoredServers = (): StoredServer[] => {
  if (!fs.existsSync(CONNECTIONS_FILE)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(CONNECTIONS_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
};

const saveStoredServers = (servers: StoredServer[]) => {
  fs.writeFileSync(CONNECTIONS_FILE, JSON.stringify(servers, null, 2));
};

const getAppState = () => {
  if (!fs.existsSync(APP_STATE_FILE)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(APP_STATE_FILE, 'utf-8'));
  } catch (e) {
    return null;
  }
};

const saveAppState = (state: any) => {
  fs.writeFileSync(APP_STATE_FILE, JSON.stringify(state, null, 2));
};

const getAppSettings = () => {
  if (!fs.existsSync(APP_SETTINGS_FILE)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(APP_SETTINGS_FILE, 'utf-8'));
  } catch (e) {
    return {};
  }
};

const saveAppSettings = (settings: any) => {
  fs.writeFileSync(APP_SETTINGS_FILE, JSON.stringify(settings, null, 2));
};

// Servidores activos (en memoria)
let activeServers: ServerInfo[] = [];

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.openDevTools()

  // En desarrollo, cargamos desde el servidor de Vite
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // En producción, cargamos el archivo index.html compilado
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }
}

app.whenReady().then(() => {
  // Configurar el menú de la aplicación
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

    const driver = new MySQLDriver();
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

    const driver = new MySQLDriver();
    try {
      const db = server.databases?.find(d => d.name === dbName);
      if (db && db.tables && db.tables.length > 0) {
        return db.tables;
      }

      let tables: any[] = [];
      if (server.config) {
        const config = { ...server.config, database: dbName };
        await driver.connect(config);
        tables = await driver.getTables(dbName);
      } else {
        throw new Error('Server configuration missing');
      }

      if (db) {
        db.tables = tables;
        db.size = tables.reduce((acc, t) => acc + (Number(t.size) || 0), 0);
      } else if (server.databases) {
        server.databases.push({ 
          name: dbName, 
          tables, 
          size: tables.reduce((acc, t) => acc + (Number(t.size) || 0), 0) 
        });
      } else {
        server.databases = [{ 
          name: dbName, 
          tables, 
          size: tables.reduce((acc, t) => acc + (Number(t.size) || 0), 0) 
        }];
      }

      return tables;
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:getSchema', async (_event, serverName: string, dbName: string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');

    const driver = new MySQLDriver();
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
    const driver = new MySQLDriver();
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
  ipcMain.handle('api:saveAppState', (_event, state: any) => saveAppState(state));
  ipcMain.handle('api:getAppSettings', () => getAppSettings());
  ipcMain.handle('api:saveAppSettings', (_event, settings: any) => saveAppSettings(settings));

  ipcMain.handle('api:getTableData', async (_event, serverName: string, dbName: string, tableName: string, options: any) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');

    const driver = new MySQLDriver();
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

    const driver = new MySQLDriver();
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
    const driver = new MySQLDriver();
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

  ipcMain.handle('api:addIndex', async (_event, serverName: string, dbName: string, tableName: string, index: any) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    const driver = new MySQLDriver();
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
    const driver = new MySQLDriver();
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
    const driver = new MySQLDriver();
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

  ipcMain.handle('api:addForeignKey', async (_event, serverName: string, dbName: string, tableName: string, fk: any) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    const driver = new MySQLDriver();
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
    const driver = new MySQLDriver();
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        await driver.dropForeignKey(dbName, tableName, fkName);
      } else throw new Error('Server configuration missing');
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:addColumn', async (_event, serverName: string, dbName: string, tableName: string, column: any, afterColumn: any) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    const driver = new MySQLDriver();
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        await driver.addColumn(dbName, tableName, column, afterColumn);
      } else throw new Error('Server configuration missing');
    } finally {
      await driver.disconnect();
    }
  });

  ipcMain.handle('api:updateColumn', async (_event, serverName: string, dbName: string, tableName: string, oldName: string, column: any, afterColumn: any) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    const driver = new MySQLDriver();
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
    const driver = new MySQLDriver();
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
    const driver = new MySQLDriver();
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

  ipcMain.handle('api:getSupportedTypes', async (_event, serverName: string) => {
    const server = activeServers.find(s => s.name === serverName);
    if (!server) throw new Error('Server not found');
    const driver = new MySQLDriver();
    try {
      if (server.config) {
        await driver.connect(server.config);
        return await driver.getSupportedTypes();
      }
      throw new Error('Server configuration missing');
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
