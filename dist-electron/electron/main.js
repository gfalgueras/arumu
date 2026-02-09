"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const mysql_driver_1 = require("../backend/src/drivers/mysql.driver");
// Soporte para serializar BigInt en JSON (Electron/Node)
BigInt.prototype.toJSON = function () {
    return this.toString();
};
// Define the connections file path in the user's home directory
const USER_HOME = process.env.HOME || process.env.USERPROFILE || '';
const CONFIG_DIR = path_1.default.join(USER_HOME, '.sqlmanager');
const CONNECTIONS_FILE = path_1.default.join(CONFIG_DIR, 'connections.json');
const APP_STATE_FILE = path_1.default.join(CONFIG_DIR, 'state.json');
const APP_SETTINGS_FILE = path_1.default.join(CONFIG_DIR, 'settings.json');
const OLD_CONNECTIONS_FILE = path_1.default.join(process.cwd(), 'connections.json');
// Ensure directory exists
if (!fs_1.default.existsSync(CONFIG_DIR)) {
    fs_1.default.mkdirSync(CONFIG_DIR, { recursive: true });
}
// Migrate old connections if they exist
if (fs_1.default.existsSync(OLD_CONNECTIONS_FILE) && !fs_1.default.existsSync(CONNECTIONS_FILE)) {
    try {
        fs_1.default.renameSync(OLD_CONNECTIONS_FILE, CONNECTIONS_FILE);
        console.log('Migrated connections to:', CONNECTIONS_FILE);
    }
    catch (err) {
        console.error('Failed to migrate connections:', err);
    }
}
// Helper to read/write connections
const getStoredServers = () => {
    if (!fs_1.default.existsSync(CONNECTIONS_FILE)) {
        return [];
    }
    try {
        return JSON.parse(fs_1.default.readFileSync(CONNECTIONS_FILE, 'utf-8'));
    }
    catch (e) {
        return [];
    }
};
const saveStoredServers = (servers) => {
    fs_1.default.writeFileSync(CONNECTIONS_FILE, JSON.stringify(servers, null, 2));
};
const getAppState = () => {
    if (!fs_1.default.existsSync(APP_STATE_FILE)) {
        return null;
    }
    try {
        return JSON.parse(fs_1.default.readFileSync(APP_STATE_FILE, 'utf-8'));
    }
    catch (e) {
        return null;
    }
};
const saveAppState = (state) => {
    fs_1.default.writeFileSync(APP_STATE_FILE, JSON.stringify(state, null, 2));
};
const getAppSettings = () => {
    if (!fs_1.default.existsSync(APP_SETTINGS_FILE)) {
        return {};
    }
    try {
        return JSON.parse(fs_1.default.readFileSync(APP_SETTINGS_FILE, 'utf-8'));
    }
    catch (e) {
        return {};
    }
};
const saveAppSettings = (settings) => {
    fs_1.default.writeFileSync(APP_SETTINGS_FILE, JSON.stringify(settings, null, 2));
};
// Servidores activos (en memoria)
let activeServers = [];
function createWindow() {
    const mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    mainWindow.webContents.openDevTools();
    // En desarrollo, cargamos desde el servidor de Vite
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    }
    else {
        // En producción, cargamos el archivo index.html compilado
        mainWindow.loadFile(path_1.default.join(__dirname, '../frontend/dist/index.html'));
    }
}
electron_1.app.whenReady().then(() => {
    // Configurar el menú de la aplicación
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Exit',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
                    click: () => {
                        electron_1.app.quit();
                    }
                }
            ]
        }
    ];
    const menu = electron_1.Menu.buildFromTemplate(template);
    electron_1.Menu.setApplicationMenu(menu);
    // IPC Handlers
    electron_1.ipcMain.handle('api:getServers', () => {
        return activeServers.map(s => ({
            name: s.name,
            type: s.type
        }));
    });
    electron_1.ipcMain.handle('api:getDatabases', async (_event, serverName) => {
        const server = activeServers.find(s => s.name === serverName);
        if (!server)
            throw new Error('Server not found');
        const driver = new mysql_driver_1.MySQLDriver();
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
            }
            else {
                throw new Error('Server configuration missing');
            }
        }
        finally {
            await driver.disconnect();
        }
    });
    electron_1.ipcMain.handle('api:getTables', async (_event, serverName, dbName) => {
        const server = activeServers.find(s => s.name === serverName);
        if (!server)
            throw new Error('Server not found');
        const driver = new mysql_driver_1.MySQLDriver();
        try {
            const db = server.databases?.find(d => d.name === dbName);
            if (db && db.tables && db.tables.length > 0) {
                return db.tables;
            }
            let tables = [];
            if (server.config) {
                const config = { ...server.config, database: dbName };
                await driver.connect(config);
                tables = await driver.getTables(dbName);
            }
            else {
                throw new Error('Server configuration missing');
            }
            if (db) {
                db.tables = tables;
                db.size = tables.reduce((acc, t) => acc + (Number(t.size) || 0), 0);
            }
            else if (server.databases) {
                server.databases.push({
                    name: dbName,
                    tables,
                    size: tables.reduce((acc, t) => acc + (Number(t.size) || 0), 0)
                });
            }
            else {
                server.databases = [{
                        name: dbName,
                        tables,
                        size: tables.reduce((acc, t) => acc + (Number(t.size) || 0), 0)
                    }];
            }
            return tables;
        }
        finally {
            await driver.disconnect();
        }
    });
    electron_1.ipcMain.handle('api:getSchema', async (_event, serverName, dbName) => {
        const server = activeServers.find(s => s.name === serverName);
        if (!server)
            throw new Error('Server not found');
        const driver = new mysql_driver_1.MySQLDriver();
        try {
            if (server.config) {
                await driver.connect({ ...server.config, database: dbName });
                return await driver.getSchema(dbName);
            }
            throw new Error('Server configuration missing');
        }
        finally {
            await driver.disconnect();
        }
    });
    electron_1.ipcMain.handle('api:connect', async (_event, storedServer) => {
        const driver = new mysql_driver_1.MySQLDriver();
        try {
            if (!storedServer || !storedServer.config) {
                throw new Error('Server configuration missing or invalid');
            }
            const alreadyActive = activeServers.find(s => s.name === storedServer.name);
            if (!alreadyActive) {
                await driver.connect(storedServer.config);
            }
            const newActiveServer = {
                ...storedServer,
                databases: alreadyActive ? alreadyActive.databases : []
            };
            if (!alreadyActive) {
                activeServers.push(newActiveServer);
            }
            return newActiveServer;
        }
        finally {
            await driver.disconnect();
        }
    });
    electron_1.ipcMain.handle('api:disconnectServer', (_event, name) => {
        activeServers = activeServers.filter(s => s.name !== name);
    });
    electron_1.ipcMain.handle('api:getStoredServers', () => getStoredServers());
    electron_1.ipcMain.handle('api:saveStoredServer', (_event, newServer) => {
        const servers = getStoredServers();
        if (servers.find(s => s.name === newServer.name)) {
            throw new Error('Ya existe un servidor con este nombre');
        }
        servers.push(newServer);
        saveStoredServers(servers);
        return newServer;
    });
    electron_1.ipcMain.handle('api:updateStoredServer', (_event, name, updatedServer) => {
        const servers = getStoredServers();
        const index = servers.findIndex(s => s.name === name);
        if (index === -1)
            throw new Error('Server not found');
        servers[index] = updatedServer;
        saveStoredServers(servers);
        const activeIndex = activeServers.findIndex(s => s.name === name);
        if (activeIndex !== -1) {
            activeServers[activeIndex] = { ...updatedServer, databases: [] };
        }
        return servers[index];
    });
    electron_1.ipcMain.handle('api:getAppState', () => getAppState());
    electron_1.ipcMain.handle('api:saveAppState', (_event, state) => saveAppState(state));
    electron_1.ipcMain.handle('api:getAppSettings', () => getAppSettings());
    electron_1.ipcMain.handle('api:saveAppSettings', (_event, settings) => saveAppSettings(settings));
    electron_1.ipcMain.handle('api:getTableData', async (_event, serverName, dbName, tableName, options) => {
        const server = activeServers.find(s => s.name === serverName);
        if (!server)
            throw new Error('Server not found');
        const driver = new mysql_driver_1.MySQLDriver();
        try {
            if (server.config) {
                await driver.connect({ ...server.config, database: dbName });
                return await driver.getTableData(dbName, tableName, options.limit, options.offset, options.sort, options.filter);
            }
            throw new Error('Server configuration missing');
        }
        finally {
            await driver.disconnect();
        }
    });
    electron_1.ipcMain.handle('api:getTableColumns', async (_event, serverName, dbName, tableName) => {
        const server = activeServers.find(s => s.name === serverName);
        if (!server)
            throw new Error('Server not found');
        const driver = new mysql_driver_1.MySQLDriver();
        try {
            if (server.config) {
                await driver.connect({ ...server.config, database: dbName });
                return await driver.getTableColumns(dbName, tableName);
            }
            throw new Error('Server configuration missing');
        }
        finally {
            await driver.disconnect();
        }
    });
    electron_1.ipcMain.handle('api:getTableIndexes', async (_event, serverName, dbName, tableName) => {
        const server = activeServers.find(s => s.name === serverName);
        if (!server)
            throw new Error('Server not found');
        const driver = new mysql_driver_1.MySQLDriver();
        try {
            if (server.config) {
                await driver.connect({ ...server.config, database: dbName });
                return await driver.getTableIndexes(dbName, tableName);
            }
            throw new Error('Server configuration missing');
        }
        finally {
            await driver.disconnect();
        }
    });
    electron_1.ipcMain.handle('api:addIndex', async (_event, serverName, dbName, tableName, index) => {
        const server = activeServers.find(s => s.name === serverName);
        if (!server)
            throw new Error('Server not found');
        const driver = new mysql_driver_1.MySQLDriver();
        try {
            if (server.config) {
                await driver.connect({ ...server.config, database: dbName });
                await driver.addIndex(dbName, tableName, index);
            }
            else
                throw new Error('Server configuration missing');
        }
        finally {
            await driver.disconnect();
        }
    });
    electron_1.ipcMain.handle('api:dropIndex', async (_event, serverName, dbName, tableName, indexName) => {
        const server = activeServers.find(s => s.name === serverName);
        if (!server)
            throw new Error('Server not found');
        const driver = new mysql_driver_1.MySQLDriver();
        try {
            if (server.config) {
                await driver.connect({ ...server.config, database: dbName });
                await driver.dropIndex(dbName, tableName, indexName);
            }
            else
                throw new Error('Server configuration missing');
        }
        finally {
            await driver.disconnect();
        }
    });
    electron_1.ipcMain.handle('api:getTableForeignKeys', async (_event, serverName, dbName, tableName) => {
        const server = activeServers.find(s => s.name === serverName);
        if (!server)
            throw new Error('Server not found');
        const driver = new mysql_driver_1.MySQLDriver();
        try {
            if (server.config) {
                await driver.connect({ ...server.config, database: dbName });
                return await driver.getTableForeignKeys(dbName, tableName);
            }
            throw new Error('Server configuration missing');
        }
        finally {
            await driver.disconnect();
        }
    });
    electron_1.ipcMain.handle('api:addForeignKey', async (_event, serverName, dbName, tableName, fk) => {
        const server = activeServers.find(s => s.name === serverName);
        if (!server)
            throw new Error('Server not found');
        const driver = new mysql_driver_1.MySQLDriver();
        try {
            if (server.config) {
                await driver.connect({ ...server.config, database: dbName });
                await driver.addForeignKey(dbName, tableName, fk);
            }
            else
                throw new Error('Server configuration missing');
        }
        finally {
            await driver.disconnect();
        }
    });
    electron_1.ipcMain.handle('api:dropForeignKey', async (_event, serverName, dbName, tableName, fkName) => {
        const server = activeServers.find(s => s.name === serverName);
        if (!server)
            throw new Error('Server not found');
        const driver = new mysql_driver_1.MySQLDriver();
        try {
            if (server.config) {
                await driver.connect({ ...server.config, database: dbName });
                await driver.dropForeignKey(dbName, tableName, fkName);
            }
            else
                throw new Error('Server configuration missing');
        }
        finally {
            await driver.disconnect();
        }
    });
    electron_1.ipcMain.handle('api:addColumn', async (_event, serverName, dbName, tableName, column, afterColumn) => {
        const server = activeServers.find(s => s.name === serverName);
        if (!server)
            throw new Error('Server not found');
        const driver = new mysql_driver_1.MySQLDriver();
        try {
            if (server.config) {
                await driver.connect({ ...server.config, database: dbName });
                await driver.addColumn(dbName, tableName, column, afterColumn);
            }
            else
                throw new Error('Server configuration missing');
        }
        finally {
            await driver.disconnect();
        }
    });
    electron_1.ipcMain.handle('api:updateColumn', async (_event, serverName, dbName, tableName, oldName, column, afterColumn) => {
        const server = activeServers.find(s => s.name === serverName);
        if (!server)
            throw new Error('Server not found');
        const driver = new mysql_driver_1.MySQLDriver();
        try {
            if (server.config) {
                await driver.connect({ ...server.config, database: dbName });
                await driver.updateColumn(dbName, tableName, oldName, column, afterColumn);
            }
            else
                throw new Error('Server configuration missing');
        }
        finally {
            await driver.disconnect();
        }
    });
    electron_1.ipcMain.handle('api:getTableCreateStatement', async (_event, serverName, dbName, tableName) => {
        const server = activeServers.find(s => s.name === serverName);
        if (!server)
            throw new Error('Server not found');
        const driver = new mysql_driver_1.MySQLDriver();
        try {
            if (server.config) {
                await driver.connect({ ...server.config, database: dbName });
                const statement = await driver.getTableCreateStatement(dbName, tableName);
                return { statement };
            }
            throw new Error('Server configuration missing');
        }
        finally {
            await driver.disconnect();
        }
    });
    electron_1.ipcMain.handle('api:executeSql', async (_event, serverName, sql, database) => {
        const server = activeServers.find(s => s.name === serverName);
        if (!server)
            throw new Error('Server not found');
        const driver = new mysql_driver_1.MySQLDriver();
        try {
            if (server.config) {
                await driver.connect({ ...server.config, database: database || server.config.database });
                return await driver.executeQuery(sql);
            }
            throw new Error('Server configuration missing');
        }
        finally {
            await driver.disconnect();
        }
    });
    electron_1.ipcMain.handle('api:getSupportedTypes', async (_event, serverName) => {
        const server = activeServers.find(s => s.name === serverName);
        if (!server)
            throw new Error('Server not found');
        const driver = new mysql_driver_1.MySQLDriver();
        try {
            if (server.config) {
                await driver.connect(server.config);
                return await driver.getSupportedTypes();
            }
            throw new Error('Server configuration missing');
        }
        finally {
            await driver.disconnect();
        }
    });
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
