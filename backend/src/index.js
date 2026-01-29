"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors = require("cors");
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mysql_driver_1 = require("./drivers/mysql.driver");
const app = (0, express_1.default)();
const port = 3001;
const CONNECTIONS_FILE = path_1.default.join(process.cwd(), 'connections.json');
// Ensure directory exists
const connectionsDir = path_1.default.dirname(CONNECTIONS_FILE);
if (!fs_1.default.existsSync(connectionsDir)) {
    fs_1.default.mkdirSync(connectionsDir, { recursive: true });
}
console.log('Connections file path:', CONNECTIONS_FILE);
app.use(cors());
app.use(express_1.default.json());
// Helper to read/write connections
const getStoredServers = () => {
    if (!fs_1.default.existsSync(CONNECTIONS_FILE)) {
        return [];
    }
    return JSON.parse(fs_1.default.readFileSync(CONNECTIONS_FILE, 'utf-8'));
};
const saveStoredServers = (servers) => {
    fs_1.default.writeFileSync(CONNECTIONS_FILE, JSON.stringify(servers, null, 2));
};
// Mock de servidores activos (en memoria por ahora para la demo)
let activeServers = [
    {
        id: '1',
        name: 'Local MySQL',
        type: 'mysql',
        databases: [
            {
                name: 'production_db',
                tables: [{ name: 'users' }, { name: 'orders' }, { name: 'products' }]
            },
            {
                name: 'staging_db',
                tables: [{ name: 'users' }, { name: 'test_data' }]
            }
        ]
    }
];
app.get('/api/servers', (req, res) => {
    res.json(activeServers);
});
app.post('/api/servers/connect', (req, res) => {
    const storedServer = req.body;
    // En una app real aquí usaríamos el driver para conectar y obtener DBs/tablas
    // Por ahora simulamos la conexión añadiéndolo a activeServers
    const newActiveServer = {
        ...storedServer,
        databases: [
            { name: 'new_db', tables: [{ name: 'table1' }] }
        ]
    };
    if (!activeServers.find(s => s.id === newActiveServer.id)) {
        activeServers.push(newActiveServer);
    }
    res.json(newActiveServer);
});
app.delete('/api/servers/:id', (req, res) => {
    activeServers = activeServers.filter(s => s.id !== req.params.id);
    res.sendStatus(204);
});
// Endpoints para gestionar conexiones guardadas
app.get('/api/stored-servers', (req, res) => {
    res.json(getStoredServers());
});
app.post('/api/stored-servers', (req, res) => {
    try {
        const servers = getStoredServers();
        const newServer = { ...req.body, id: Date.now().toString() };
        servers.push(newServer);
        saveStoredServers(servers);
        res.json(newServer);
    }
    catch (error) {
        console.error('Error saving stored server:', error);
        res.status(500).json({ error: 'Failed to save connection: ' + error.message });
    }
});
// Mantener los endpoints anteriores por compatibilidad si es necesario, 
// pero el nuevo árbol usará /api/servers por ahora
const driver = new mysql_driver_1.MySQLDriver();
app.get('/api/databases', async (req, res) => {
    try {
        // Por simplicidad para la base, asumimos una conexión ya establecida o hardcoded
        // Esto debería venir de la UI en el futuro
        await driver.connect({
            host: 'localhost',
            port: 3306,
            user: 'root',
            password: ''
        });
        const databases = await driver.getDatabases();
        res.json(databases);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/databases/:db/tables', async (req, res) => {
    try {
        const tables = await driver.getTables(req.params.db);
        res.json(tables);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.listen(port, () => {
    console.log(`Backend listening at http://localhost:${port}`);
});
//# sourceMappingURL=index.js.map