import cors = require('cors');
import express from 'express';
import fs from 'fs';
import path from 'path';
import { MySQLDriver } from './drivers/mysql.driver';
import type {ServerInfo, StoredServer, DatabaseInfo} from '@shared/types/database';

const app = express();
const port = 3001;

// Define the connections file path in the user's home directory
const USER_HOME = process.env.HOME || process.env.USERPROFILE || '';
const CONFIG_DIR = path.join(USER_HOME, '.sqlmanager');
const CONNECTIONS_FILE = path.join(CONFIG_DIR, 'connections.json');
const APP_STATE_FILE = path.join(CONFIG_DIR, 'state.json');
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

console.log('Connections file path:', CONNECTIONS_FILE);

app.use(cors());
app.use(express.json());

// Helper to read/write connections
const getStoredServers = (): StoredServer[] => {
  if (!fs.existsSync(CONNECTIONS_FILE)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(CONNECTIONS_FILE, 'utf-8'));
};

const saveStoredServers = (servers: StoredServer[]) => {
  fs.writeFileSync(CONNECTIONS_FILE, JSON.stringify(servers, null, 2));
};

// Helper to read/write app state
const getAppState = () => {
  if (!fs.existsSync(APP_STATE_FILE)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(APP_STATE_FILE, 'utf-8'));
};

const saveAppState = (state: any) => {
  fs.writeFileSync(APP_STATE_FILE, JSON.stringify(state, null, 2));
};

// Servidores activos (en memoria)
let activeServers: ServerInfo[] = [];

const driver = new MySQLDriver();

app.get('/api/servers', (req, res) => {
  const sanitizedServers = activeServers.map(s => ({
    id: s.id,
    name: s.name,
    type: s.type
  }));
  res.json(sanitizedServers);
});

app.get('/api/servers/:id/databases', async (req, res) => {
  const server = activeServers.find(s => s.id === req.params.id);
  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }

  try {
    if (server.databases && server.databases.length > 0) {
      return res.json(server.databases);
    }

    if (server.config) {
      await driver.connect(server.config);
      let databases = await driver.getDatabases();
      
      // Apply default filter if present
      if (server.config.defaultFilter) {
        const filters = server.config.defaultFilter.split(',').map(f => f.trim().toLowerCase());
        databases = databases.filter(db => !filters.includes(db.name.toLowerCase()));
      }

      server.databases = databases;
      res.json(databases);
    } else {
      res.status(400).json({ error: 'Server configuration missing' });
    }
  } catch (error: any) {
    console.error('Error fetching databases:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/servers/:serverId/databases/:dbName/tables', async (req, res) => {
  const { serverId, dbName } = req.params;
  const server = activeServers.find(s => s.id === serverId);
  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }

  try {
    const db = server.databases?.find(d => d.name === dbName);
    if (db && db.tables && db.tables.length > 0) {
      return res.json(db.tables);
    }

    let tables: any[] = [];
    if (server.config) {
      const config = {
        ...server.config,
        database: dbName
      };
      await driver.connect(config);
      const tablesResult = await driver.getTables(dbName);
      tables = tablesResult;
    } else {
      return res.status(400).json({ error: 'Server configuration missing' });
    }

    if (db) {
      db.tables = tables;
      // Actualizar el tamaño de la base de datos sumando el tamaño de sus tablas
      db.size = tables.reduce((acc, t) => acc + (Number(t.size) || 0), 0);
    } else if (server.databases) {
      const existingDbIndex = server.databases.findIndex(d => d.name === dbName);
      if (existingDbIndex !== -1) {
        server.databases[existingDbIndex]!.tables = tables;
        server.databases[existingDbIndex]!.size = tables.reduce((acc, t) => acc + (Number(t.size) || 0), 0);
      } else {
        server.databases.push({ 
          name: dbName, 
          tables, 
          size: tables.reduce((acc, t) => acc + (Number(t.size) || 0), 0) 
        });
      }
    } else {
      server.databases = [{ 
        name: dbName, 
        tables, 
        size: tables.reduce((acc, t) => acc + (Number(t.size) || 0), 0) 
      }];
    }

    res.json(tables);
  } catch (error: any) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/servers/connect', async (req, res) => {
  try {
    const storedServer = req.body as StoredServer;
    
    // Validamos la conexión antes de añadirlo a activos
    if (!storedServer || !storedServer.config) {
      return res.status(400).json({ error: 'Server configuration missing or invalid request body' });
    }
    
    // Check if it's already connected
    const alreadyActive = activeServers.find(s => s.id === storedServer.id);
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
    res.json(newActiveServer);
  } catch (error: any) {
    console.error('Connection error:', error);
    let errorMessage = error.message;
    if (!errorMessage && error.code) {
      errorMessage = `Error code: ${error.code}`;
    }
    res.status(500).json({ error: 'Failed to connect: ' + (errorMessage || 'Unknown error') });
  }
});

app.delete('/api/servers/:id', (req, res) => {
  activeServers = activeServers.filter(s => s.id !== req.params.id);
  res.sendStatus(204);
});

// Endpoints para gestionar conexiones guardadas
app.get('/api/stored-servers', (req, res) => {
  res.json(getStoredServers());
});

app.get('/api/app-state', (req, res) => {
  res.json(getAppState());
});

app.post('/api/app-state', (req, res) => {
  try {
    saveAppState(req.body);
    res.sendStatus(204);
  } catch (error: any) {
    console.error('Error saving app state:', error);
    res.status(500).json({ error: 'Failed to save app state: ' + error.message });
  }
});

app.post('/api/stored-servers', (req, res) => {
  try {
    const servers = getStoredServers();
    const newServer = { ...req.body, id: Date.now().toString() };
    servers.push(newServer);
    saveStoredServers(servers);
    res.json(newServer);
  } catch (error: any) {
    console.error('Error saving stored server:', error);
    res.status(500).json({ error: 'Failed to save connection: ' + error.message });
  }
});

app.put('/api/stored-servers/:id', (req, res) => {
  try {
    const servers = getStoredServers();
    const index = servers.findIndex(s => s.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Server not found' });
    }
    servers[index] = { ...req.body, id: req.params.id };
    saveStoredServers(servers);
    
    // Si el servidor está activo, actualizar su config y limpiar cache de bases de datos
    const activeIndex = activeServers.findIndex(s => s.id === req.params.id);
    if (activeIndex !== -1) {
      const updatedServer: ServerInfo = { 
        ...servers[index]!, 
        databases: [] // Limpiamos para forzar recarga con nuevos filtros
      };
      activeServers[activeIndex] = updatedServer;
    }

    res.json(servers[index]);
  } catch (error: any) {
    console.error('Error updating stored server:', error);
    res.status(500).json({ error: 'Failed to update connection: ' + error.message });
  }
});

app.get('/api/debug/tables-raw/:serverId/:dbName', async (req, res) => {
  const { serverId, dbName } = req.params;
  const server = activeServers.find(s => s.id === serverId);
  if (!server || !server.config) return res.status(404).json({ error: 'Server or configuration not found' });
  try {
    const config = { ...server.config, database: dbName };
    await driver.connect(config);
    const result = await driver.executeQuery(`SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${dbName}' LIMIT 1`);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/servers/:serverId/databases/:dbName/tables/:tableName/data', async (req, res) => {
  const { serverId, dbName, tableName } = req.params;
  const limit = parseInt(req.query.limit as string) || 1000;
  const offset = parseInt(req.query.offset as string) || 0;
  const sort = req.query.sort ? JSON.parse(req.query.sort as string) : undefined;
  const filter = req.query.filter as string | undefined;

  const server = activeServers.find(s => s.id === serverId);
  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }

  try {
    if (server.config) {
      const config = {
        ...server.config,
        database: dbName
      };
      await driver.connect(config);
      const data = await driver.getTableData(dbName, tableName, limit, offset, sort, filter);
      res.json(data);
    } else {
      res.status(400).json({ error: 'Server configuration missing' });
    }
  } catch (error: any) {
    console.error('Error fetching table data:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/servers/:serverId/execute', async (req, res) => {
  const { serverId } = req.params;
  const { sql, database } = req.body;

  const server = activeServers.find(s => s.id === serverId);
  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }

  try {
    if (server.config) {
      const config = {
        ...server.config,
        database: database || server.config.database
      };
      await driver.connect(config);
      const result = await driver.executeQuery(sql);
      res.json(result);
    } else {
      res.status(400).json({ error: 'Server configuration missing' });
    }
  } catch (error: any) {
    console.error('Error executing query:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Backend listening at http://localhost:${port}`);
});
