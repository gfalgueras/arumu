import { app, Menu, ipcMain, dialog, BrowserWindow, safeStorage } from "electron";
import path from "path";
import fs from "fs";
import mysql from "mysql2/promise";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
class MySQLDriver {
  constructor() {
    this.connection = null;
  }
  async connect(config) {
    this.connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      dateStrings: true
    });
  }
  async disconnect() {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }
  async getDatabases() {
    if (!this.connection) throw new Error("Not connected");
    const [rows] = await this.connection.execute("SHOW DATABASES");
    return rows.map((row) => ({
      name: row.Database,
      tables: []
    }));
  }
  async getTables(database) {
    if (!this.connection) throw new Error("Not connected");
    const query = `
      SELECT 
        TABLE_NAME as name, 
        (DATA_LENGTH + INDEX_LENGTH) as size
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ?
    `;
    const [rows] = await this.connection.execute(query, [database]);
    return rows.map((row) => ({
      name: String(row.name || row.TABLE_NAME),
      size: Number(row.size !== void 0 ? row.size : Number(row.DATA_LENGTH || 0) + Number(row.INDEX_LENGTH || 0))
    }));
  }
  async getSchema(database) {
    if (!this.connection) throw new Error("Not connected");
    const query = `
      SELECT TABLE_NAME, COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `;
    const [rows] = await this.connection.execute(query, [database]);
    const schema = {};
    rows.forEach((row) => {
      const tableName = row.TABLE_NAME || row.table_name || row.TableName;
      const columnName = row.COLUMN_NAME || row.column_name || row.ColumnName;
      if (tableName && columnName) {
        if (!schema[tableName]) {
          schema[tableName] = [];
        }
        schema[tableName].push(columnName);
      }
    });
    return schema;
  }
  async getTableColumns(database, table) {
    if (!this.connection) throw new Error("Not connected");
    const query = `
      SELECT 
        COLUMN_NAME as name, 
        COLUMN_TYPE as type, 
        IS_NULLABLE as nullable, 
        COLUMN_KEY as 'key', 
        COLUMN_DEFAULT as 'default', 
        EXTRA as extra,
        COLUMN_COMMENT as comment,
        COLLATION_NAME as collation,
        GENERATION_EXPRESSION as expression
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? 
      ORDER BY ORDINAL_POSITION
    `;
    const [rows] = await this.connection.execute(query, [database, table]);
    return rows.map((row) => {
      const getValue = (obj, key) => {
        const foundKey = Object.keys(obj).find((k) => k.toLowerCase() === key.toLowerCase());
        return foundKey ? obj[foundKey] : void 0;
      };
      const extra = getValue(row, "extra") || "";
      const fullType = getValue(row, "type") || "";
      const unsigned = fullType.toLowerCase().includes("unsigned");
      const typeMatch = fullType.match(/^([a-z]+)(?:\(([^)]+)\))?/i);
      const type = typeMatch ? typeMatch[1].toUpperCase() : fullType.split(" ")[0].toUpperCase();
      const length = typeMatch ? typeMatch[2] : null;
      return {
        name: getValue(row, "name"),
        type,
        length,
        nullable: getValue(row, "nullable") === "YES",
        key: getValue(row, "key"),
        default: getValue(row, "default"),
        extra,
        comment: getValue(row, "comment"),
        collation: getValue(row, "collation"),
        expression: getValue(row, "expression"),
        virtuality: extra.includes("VIRTUAL") ? "VIRTUAL" : extra.includes("STORED") ? "STORED" : "",
        unsigned
      };
    });
  }
  async getTableIndexes(database, table) {
    if (!this.connection) throw new Error("Not connected");
    const query = `
      SELECT 
        INDEX_NAME as name,
        COLUMN_NAME as column_name,
        NON_UNIQUE as non_unique,
        INDEX_TYPE as type
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `;
    const [rows] = await this.connection.execute(query, [database, table]);
    const indexesMap = /* @__PURE__ */ new Map();
    rows.forEach((row) => {
      const name = row.name;
      if (!indexesMap.has(name)) {
        let trueType = "INDEX";
        if (name === "PRIMARY") {
          trueType = "PRIMARY";
        } else if (row.type === "FULLTEXT") {
          trueType = "FULLTEXT";
        } else if (row.type === "SPATIAL") {
          trueType = "SPATIAL";
        } else if (row.non_unique === 0) {
          trueType = "UNIQUE";
        }
        indexesMap.set(name, {
          name,
          columns: [],
          unique: row.non_unique === 0,
          type: trueType,
          method: row.type
        });
      }
      indexesMap.get(name).columns.push(row.column_name);
    });
    return Array.from(indexesMap.values());
  }
  async getTableForeignKeys(database, table) {
    if (!this.connection) throw new Error("Not connected");
    const query = `
      SELECT
        k.CONSTRAINT_NAME as name,
        k.COLUMN_NAME as column_name,
        k.REFERENCED_TABLE_NAME as referenced_table,
        k.REFERENCED_COLUMN_NAME as referenced_column,
        r.UPDATE_RULE as update_rule,
        r.DELETE_RULE as delete_rule
      FROM information_schema.KEY_COLUMN_USAGE k
      JOIN information_schema.REFERENTIAL_CONSTRAINTS r 
        ON k.CONSTRAINT_NAME = r.CONSTRAINT_NAME 
        AND k.CONSTRAINT_SCHEMA = r.CONSTRAINT_SCHEMA
      WHERE k.TABLE_SCHEMA = ? 
        AND k.TABLE_NAME = ? 
        AND k.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY k.CONSTRAINT_NAME, k.ORDINAL_POSITION
    `;
    const [rows] = await this.connection.execute(query, [database, table]);
    const fksMap = /* @__PURE__ */ new Map();
    rows.forEach((row) => {
      const name = row.name;
      if (!fksMap.has(name)) {
        fksMap.set(name, {
          name,
          columns: [],
          referencedTable: row.referenced_table,
          referencedColumns: [],
          updateRule: row.update_rule,
          deleteRule: row.delete_rule
        });
      }
      fksMap.get(name).columns.push(row.column_name);
      fksMap.get(name).referencedColumns.push(row.referenced_column);
    });
    return Array.from(fksMap.values());
  }
  async getTableCreateStatement(database, table) {
    if (!this.connection) throw new Error("Not connected");
    const escapedDb = database.replace(/`/g, "``");
    const escapedTable = table.replace(/`/g, "``");
    const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
    const [rows] = await this.connection.execute(`SHOW CREATE TABLE ${fullTableName}`);
    if (rows && rows.length > 0) {
      const row = rows[0];
      const createTableKey = Object.keys(row).find((k) => k.toLowerCase() === "create table");
      return createTableKey ? row[createTableKey] : "";
    }
    return "";
  }
  async getTableData(database, table, limit, offset, sort, filter) {
    if (!this.connection) throw new Error("Not connected");
    const escapedDb = database.replace(/`/g, "``");
    const escapedTable = table.replace(/`/g, "``");
    const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
    const colQuery = `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`;
    const [colRows] = await this.connection.execute(colQuery, [database, table]);
    const columns = colRows.map((r) => r.COLUMN_NAME);
    let whereClause = "";
    const params = [];
    if (filter && columns.length > 0) {
      const trimmedFilter = filter.trim();
      const lowerFilter = trimmedFilter.toLowerCase();
      const isRawWhere = lowerFilter.startsWith("where ") || lowerFilter.includes("=") || lowerFilter.includes(">") || lowerFilter.includes("<") || lowerFilter.includes(" like ") || lowerFilter.includes(" is null") || lowerFilter.includes(" is not null") || lowerFilter.includes(" between ") || lowerFilter.includes(" in (");
      if (isRawWhere) {
        if (lowerFilter.startsWith("where ")) {
          whereClause = trimmedFilter;
        } else {
          whereClause = `WHERE ${trimmedFilter}`;
        }
        console.log(`[MySQLDriver] Using raw WHERE clause: ${whereClause}`);
      } else if (columns.length > 0) {
        const searchTerms = columns.map((col) => `\`${col.replace(/`/g, "``")}\` LIKE ?`).join(" OR ");
        whereClause = `WHERE ${searchTerms}`;
        const filterValue = `%${filter}%`;
        columns.forEach(() => params.push(filterValue));
        console.log(`[MySQLDriver] Using search filter: ${filter}`);
      }
    }
    let orderBy = "";
    if (sort && sort.length > 0) {
      orderBy = "ORDER BY " + sort.map((s) => `\`${s.column.replace(/`/g, "``")}\` ${s.direction}`).join(", ");
    }
    const safeLimit = Math.max(1, Math.floor(Number(limit)));
    const safeOffset = Math.max(0, Math.floor(Number(offset)));
    const query = `SELECT * FROM ${fullTableName} ${whereClause} ${orderBy} LIMIT ${safeLimit} OFFSET ${safeOffset}`;
    const countQuery = `SELECT COUNT(*) as total FROM ${fullTableName} ${whereClause}`;
    const [[rows], [countRows]] = await Promise.all([
      this.connection.execute(query, params),
      this.connection.execute(countQuery, params)
    ]);
    const cleanRows = JSON.parse(JSON.stringify(
      rows,
      (_key, value) => typeof value === "bigint" ? value.toString() : value
    ));
    return {
      columns,
      rows: cleanRows,
      total: countRows && countRows[0] ? Number(countRows[0].total) : 0
    };
  }
  async executeQuery(sql) {
    if (!this.connection) throw new Error("Not connected");
    const [result] = await this.connection.execute(sql);
    return JSON.parse(JSON.stringify(
      result,
      (_key, value) => typeof value === "bigint" ? value.toString() : value
    ));
  }
  async addIndex(database, table, index) {
    if (!this.connection) throw new Error("Not connected");
    const escapedDb = database.replace(/`/g, "``");
    const escapedTable = table.replace(/`/g, "``");
    const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
    const columns = index.columns.map((col) => `\`${col.replace(/`/g, "``")}\``).join(", ");
    let indexKeyword = "INDEX";
    if (index.type === "UNIQUE") indexKeyword = "UNIQUE INDEX";
    else if (index.type === "FULLTEXT") indexKeyword = "FULLTEXT INDEX";
    else if (index.type === "SPATIAL") indexKeyword = "SPATIAL INDEX";
    else if (index.type === "PRIMARY") indexKeyword = "PRIMARY KEY";
    const indexName = index.name && index.type !== "PRIMARY" ? `\`${index.name.replace(/`/g, "``")}\`` : "";
    let sql = "";
    if (index.type === "PRIMARY") {
      sql = `ALTER TABLE ${fullTableName} ADD PRIMARY KEY (${columns})`;
    } else if (indexName) {
      sql = `CREATE ${indexKeyword} ${indexName} ON ${fullTableName} (${columns})`;
    } else {
      sql = `ALTER TABLE ${fullTableName} ADD ${indexKeyword} (${columns})`;
    }
    await this.connection.execute(sql);
  }
  async addForeignKey(database, table, fk) {
    if (!this.connection) throw new Error("Not connected");
    const escapedDb = database.replace(/`/g, "``");
    const escapedTable = table.replace(/`/g, "``");
    const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
    const columns = fk.columns.map((col) => `\`${col.replace(/`/g, "``")}\``).join(", ");
    const refTable = `\`${escapedDb}\`.\`${fk.referencedTable.replace(/`/g, "``")}\``;
    const refColumns = fk.referencedColumns.map((col) => `\`${col.replace(/`/g, "``")}\``).join(", ");
    const constraintName = fk.name ? `CONSTRAINT \`${fk.name.replace(/`/g, "``")}\`` : "";
    const ALLOWED_FK_RULES = ["CASCADE", "NO ACTION", "RESTRICT", "SET NULL", "SET DEFAULT"];
    const updateRule = (fk.updateRule || "").toUpperCase();
    const deleteRule = (fk.deleteRule || "").toUpperCase();
    if (fk.updateRule && !ALLOWED_FK_RULES.includes(updateRule)) {
      throw new Error(`Invalid ON UPDATE rule: ${fk.updateRule}`);
    }
    if (fk.deleteRule && !ALLOWED_FK_RULES.includes(deleteRule)) {
      throw new Error(`Invalid ON DELETE rule: ${fk.deleteRule}`);
    }
    let sql = `ALTER TABLE ${fullTableName} ADD ${constraintName} FOREIGN KEY (${columns}) REFERENCES ${refTable} (${refColumns})`;
    if (fk.updateRule) {
      sql += ` ON UPDATE ${updateRule}`;
    }
    if (fk.deleteRule) {
      sql += ` ON DELETE ${deleteRule}`;
    }
    await this.connection.execute(sql);
  }
  async dropIndex(database, table, indexName) {
    if (!this.connection) throw new Error("Not connected");
    const escapedDb = database.replace(/`/g, "``");
    const escapedTable = table.replace(/`/g, "``");
    const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
    if (indexName === "PRIMARY") {
      await this.connection.execute(`ALTER TABLE ${fullTableName} DROP PRIMARY KEY`);
    } else {
      await this.connection.execute(`ALTER TABLE ${fullTableName} DROP INDEX \`${indexName.replace(/`/g, "``")}\``);
    }
  }
  async dropForeignKey(database, table, fkName) {
    if (!this.connection) throw new Error("Not connected");
    const escapedDb = database.replace(/`/g, "``");
    const escapedTable = table.replace(/`/g, "``");
    const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
    await this.connection.execute(`ALTER TABLE ${fullTableName} DROP FOREIGN KEY \`${fkName.replace(/`/g, "``")}\``);
  }
  async addColumn(database, table, column, afterColumn) {
    if (!this.connection) throw new Error("Not connected");
    const escapedDb = database.replace(/`/g, "``");
    const escapedTable = table.replace(/`/g, "``");
    const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
    const newColName = `\`${column.name.replace(/`/g, "``")}\``;
    let columnType = column.type;
    if (column.length) {
      columnType += `(${column.length})`;
    }
    let sql = `ALTER TABLE ${fullTableName} ADD COLUMN ${newColName} ${columnType}`;
    if (column.unsigned) {
      sql += " UNSIGNED";
    }
    if (!column.nullable) {
      sql += " NOT NULL";
    } else {
      sql += " NULL";
    }
    if (column.default !== void 0) {
      if (column.default === null) {
        sql += " DEFAULT NULL";
      } else if (column.default.toUpperCase() === "CURRENT_TIMESTAMP") {
        sql += " DEFAULT CURRENT_TIMESTAMP";
      } else {
        sql += ` DEFAULT '${column.default.replace(/'/g, "''")}'`;
      }
    }
    if (column.extra) {
      const ALLOWED_EXTRAS = ["AUTO_INCREMENT", "ON UPDATE CURRENT_TIMESTAMP", "DEFAULT_GENERATED", "DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP"];
      const extraUpper = column.extra.toUpperCase().trim();
      if (!ALLOWED_EXTRAS.includes(extraUpper)) {
        throw new Error(`Invalid column extra value: ${column.extra}`);
      }
      sql += ` ${extraUpper}`;
    }
    if (column.comment) {
      sql += ` COMMENT '${column.comment.replace(/'/g, "''")}'`;
    }
    if (afterColumn !== void 0) {
      if (afterColumn === "") {
        sql += " FIRST";
      } else {
        sql += ` AFTER \`${afterColumn.replace(/`/g, "``")}\``;
      }
    }
    await this.connection.execute(sql);
  }
  async updateColumn(database, table, oldColumnName, newColumn, afterColumn) {
    if (!this.connection) throw new Error("Not connected");
    const escapedDb = database.replace(/`/g, "``");
    const escapedTable = table.replace(/`/g, "``");
    const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
    const oldColName = `\`${oldColumnName.replace(/`/g, "``")}\``;
    const newColName = `\`${newColumn.name.replace(/`/g, "``")}\``;
    let columnType = newColumn.type;
    if (newColumn.length) {
      columnType += `(${newColumn.length})`;
    }
    let sql = `ALTER TABLE ${fullTableName} CHANGE COLUMN ${oldColName} ${newColName} ${columnType}`;
    if (newColumn.unsigned) {
      sql += " UNSIGNED";
    }
    if (!newColumn.nullable) {
      sql += " NOT NULL";
    } else {
      sql += " NULL";
    }
    if (newColumn.default !== void 0) {
      if (newColumn.default === null) {
        sql += " DEFAULT NULL";
      } else if (newColumn.default.toUpperCase() === "CURRENT_TIMESTAMP") {
        sql += " DEFAULT CURRENT_TIMESTAMP";
      } else {
        sql += ` DEFAULT '${newColumn.default.replace(/'/g, "''")}'`;
      }
    }
    if (newColumn.extra) {
      const ALLOWED_EXTRAS = ["AUTO_INCREMENT", "ON UPDATE CURRENT_TIMESTAMP", "DEFAULT_GENERATED", "DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP"];
      const extraUpper = newColumn.extra.toUpperCase().trim();
      if (!ALLOWED_EXTRAS.includes(extraUpper)) {
        throw new Error(`Invalid column extra value: ${newColumn.extra}`);
      }
      sql += ` ${extraUpper}`;
    }
    if (newColumn.comment) {
      sql += ` COMMENT '${newColumn.comment.replace(/'/g, "''")}'`;
    }
    if (afterColumn !== void 0) {
      if (afterColumn === "") {
        sql += " FIRST";
      } else {
        sql += ` AFTER \`${afterColumn.replace(/`/g, "``")}\``;
      }
    }
    await this.connection.execute(sql);
  }
  async getSupportedTypes() {
    return [
      {
        group: "Entero",
        types: ["TINYINT", "SMALLINT", "MEDIUMINT", "INT", "BIGINT", "BIT"]
      },
      {
        group: "Real",
        types: ["DECIMAL", "FLOAT", "DOUBLE"]
      },
      {
        group: "Texto",
        types: ["CHAR", "VARCHAR", "TINYTEXT", "TEXT", "MEDIUMTEXT", "LONGTEXT"]
      },
      {
        group: "Binario",
        types: ["BINARY", "VARBINARY", "TINYBLOB", "BLOB", "MEDIUMBLOB", "LONGBLOB"]
      },
      {
        group: "Tiempo",
        types: ["DATE", "DATETIME", "TIMESTAMP", "TIME", "YEAR"]
      },
      {
        group: "Geometria",
        types: ["GEOMETRY", "POINT", "LINESTRING", "POLYGON", "MULTIPOINT", "MULTILINESTRING", "MULTIPOLYGON", "GEOMETRYCOLLECTION"]
      },
      {
        group: "Otros",
        types: ["ENUM", "SET", "JSON"]
      }
    ];
  }
}
const DB_ERROR_MESSAGES = {
  ECONNREFUSED: "Connection refused. Check host and port.",
  ETIMEDOUT: "Connection timed out. Check host and firewall.",
  ENOTFOUND: "Host not found. Check the hostname.",
  ECONNRESET: "Connection reset by server.",
  ER_ACCESS_DENIED_ERROR: "Access denied. Check username and password.",
  ER_DBACCESS_DENIED_ERROR: "Access denied to database.",
  ER_BAD_DB_ERROR: "Database does not exist.",
  ER_NOT_SUPPORTED_AUTH_MODE: "Authentication method not supported. Try a different auth plugin.",
  PROTOCOL_CONNECTION_LOST: "Connection lost.",
  ER_CON_COUNT_ERROR: "Too many connections on the server."
};
const USER_HOME = process.env.HOME || process.env.USERPROFILE || "";
const CONFIG_DIR = path.join(USER_HOME, ".arumu");
const CONNECTIONS_FILE = path.join(CONFIG_DIR, "connections.json");
const APP_STATE_FILE = path.join(CONFIG_DIR, "state.json");
const APP_SETTINGS_FILE = path.join(CONFIG_DIR, "settings.json");
const ERROR_LOG_FILE = path.join(CONFIG_DIR, "error.log");
const QUERY_HISTORY_FILE = path.join(CONFIG_DIR, "query_history.json");
const OLD_CONNECTIONS_FILE = path.join(process.cwd(), "connections.json");
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}
const writeErrorLog = (source, message, stack) => {
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  const entry = `[${ts}] [${source}] ${message}${stack ? "\n" + stack : ""}
`;
  try {
    fs.appendFileSync(ERROR_LOG_FILE, entry, "utf8");
  } catch {
  }
};
const originalConsoleError = console.error.bind(console);
console.error = (...args) => {
  originalConsoleError(...args);
  writeErrorLog(
    "main",
    args.map((a) => a instanceof Error ? a.message : String(a)).join(" "),
    args.find((a) => a instanceof Error)?.stack
  );
};
process.on("uncaughtException", (err) => {
  writeErrorLog("uncaughtException", err.message, err.stack);
});
process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  writeErrorLog("unhandledRejection", err.message, err.stack);
});
if (fs.existsSync(OLD_CONNECTIONS_FILE) && !fs.existsSync(CONNECTIONS_FILE)) {
  try {
    fs.renameSync(OLD_CONNECTIONS_FILE, CONNECTIONS_FILE);
    console.log("Migrated connections to:", CONNECTIONS_FILE);
  } catch (err) {
    console.error("Failed to migrate connections:", err);
  }
}
const encryptPassword = (password) => {
  if (safeStorage.isEncryptionAvailable()) {
    return "enc:" + safeStorage.encryptString(password).toString("base64");
  }
  return password;
};
const decryptPassword = (value) => {
  if (value.startsWith("enc:") && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(value.slice(4), "base64"));
    } catch {
      return value;
    }
  }
  return value;
};
const getStoredServers = () => {
  if (!fs.existsSync(CONNECTIONS_FILE)) {
    return [];
  }
  try {
    const servers = JSON.parse(fs.readFileSync(CONNECTIONS_FILE, "utf-8"));
    return servers.map((s) => ({
      ...s,
      config: s.config ? { ...s.config, password: decryptPassword(s.config.password || "") } : s.config
    }));
  } catch (e) {
    console.error("Failed to read connections file:", e);
    return [];
  }
};
const saveStoredServers = (servers) => {
  const encrypted = servers.map((s) => ({
    ...s,
    config: s.config ? { ...s.config, password: encryptPassword(s.config.password || "") } : s.config
  }));
  fs.writeFileSync(CONNECTIONS_FILE, JSON.stringify(encrypted, null, 2));
};
const getAppState = () => {
  if (!fs.existsSync(APP_STATE_FILE)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(APP_STATE_FILE, "utf-8"));
  } catch (e) {
    console.error("Failed to read app state file:", e);
    return null;
  }
};
const saveAppState = (state) => {
  fs.writeFileSync(APP_STATE_FILE, JSON.stringify(state, null, 2));
};
const getQueryHistory = () => {
  if (!fs.existsSync(QUERY_HISTORY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(QUERY_HISTORY_FILE, "utf-8"));
  } catch {
    return [];
  }
};
const addToQueryHistory = (entry) => {
  const history = [entry, ...getQueryHistory()].slice(0, 500);
  fs.writeFileSync(QUERY_HISTORY_FILE, JSON.stringify(history, null, 2));
};
const getAppSettings = () => {
  if (!fs.existsSync(APP_SETTINGS_FILE)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(APP_SETTINGS_FILE, "utf-8"));
  } catch (e) {
    return {};
  }
};
const saveAppSettings = (settings) => {
  fs.writeFileSync(APP_SETTINGS_FILE, JSON.stringify(settings, null, 2));
};
let activeServers = [];
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.webContents.openDevTools();
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
app.whenReady().then(() => {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Exit",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Alt+F4",
          click: () => {
            app.quit();
          }
        }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  ipcMain.handle("api:getServers", () => {
    return activeServers.map((s) => ({
      name: s.name,
      type: s.type
    }));
  });
  ipcMain.handle("api:getDatabases", async (_event, serverName) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const driver = new MySQLDriver();
    try {
      if (server.databases && server.databases.length > 0) {
        return server.databases;
      }
      if (server.config) {
        await driver.connect(server.config);
        let databases = await driver.getDatabases();
        if (server.config.defaultFilter) {
          const filters = server.config.defaultFilter.split(",").map((f) => f.trim().toLowerCase());
          databases = databases.filter((db) => !filters.includes(db.name.toLowerCase()));
        }
        server.databases = databases;
        return databases;
      } else {
        throw new Error("Server configuration missing");
      }
    } finally {
      await driver.disconnect();
    }
  });
  ipcMain.handle("api:getTables", async (_event, serverName, dbName) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const driver = new MySQLDriver();
    try {
      const db = server.databases?.find((d) => d.name === dbName);
      if (db && db.tables && db.tables.length > 0) {
        return db.tables;
      }
      let tables = [];
      if (server.config) {
        const config = { ...server.config, database: dbName };
        await driver.connect(config);
        tables = await driver.getTables(dbName);
      } else {
        throw new Error("Server configuration missing");
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
  ipcMain.handle("api:getSchema", async (_event, serverName, dbName) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const driver = new MySQLDriver();
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        return await driver.getSchema(dbName);
      }
      throw new Error("Server configuration missing");
    } finally {
      await driver.disconnect();
    }
  });
  ipcMain.handle("api:connect", async (_event, storedServer) => {
    const driver = new MySQLDriver();
    try {
      if (!storedServer || !storedServer.config) {
        throw new Error("Server configuration missing or invalid");
      }
      const alreadyActive = activeServers.find((s) => s.name === storedServer.name);
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
    } catch (err) {
      console.error("[api:connect] Error:", err);
      const friendly = err?.code ? DB_ERROR_MESSAGES[err.code] : null;
      const msg = friendly ? `${friendly} (${err.code})` : [err?.code, err?.sqlMessage || (err?.message !== err?.code ? err?.message : null)].filter(Boolean).join(": ") || String(err) || "Connection failed";
      throw new Error(msg);
    } finally {
      await driver.disconnect();
    }
  });
  ipcMain.handle("api:disconnectServer", (_event, name) => {
    activeServers = activeServers.filter((s) => s.name !== name);
  });
  ipcMain.handle("api:getStoredServers", () => getStoredServers());
  ipcMain.handle("api:saveStoredServer", (_event, newServer) => {
    const servers = getStoredServers();
    if (servers.find((s) => s.name === newServer.name)) {
      throw new Error("Ya existe un servidor con este nombre");
    }
    servers.push(newServer);
    saveStoredServers(servers);
    return newServer;
  });
  ipcMain.handle("api:updateStoredServer", (_event, name, updatedServer) => {
    const servers = getStoredServers();
    const index = servers.findIndex((s) => s.name === name);
    if (index === -1) throw new Error("Server not found");
    servers[index] = updatedServer;
    saveStoredServers(servers);
    const activeIndex = activeServers.findIndex((s) => s.name === name);
    if (activeIndex !== -1) {
      activeServers[activeIndex] = { ...updatedServer, databases: [] };
    }
    return servers[index];
  });
  ipcMain.handle("api:getAppState", () => getAppState());
  ipcMain.handle("api:saveAppState", (_event, state) => saveAppState(state));
  ipcMain.handle("api:getAppSettings", () => getAppSettings());
  ipcMain.handle("api:saveAppSettings", (_event, settings) => saveAppSettings(settings));
  ipcMain.handle("log:error", (_event, message, stack) => {
    writeErrorLog("renderer", message, stack);
  });
  ipcMain.handle("api:getTableData", async (_event, serverName, dbName, tableName, options) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const driver = new MySQLDriver();
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        return await driver.getTableData(dbName, tableName, options.limit, options.offset, options.sort, options.filter);
      }
      throw new Error("Server configuration missing");
    } finally {
      await driver.disconnect();
    }
  });
  ipcMain.handle("api:getTableColumns", async (_event, serverName, dbName, tableName) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const driver = new MySQLDriver();
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        return await driver.getTableColumns(dbName, tableName);
      }
      throw new Error("Server configuration missing");
    } finally {
      await driver.disconnect();
    }
  });
  ipcMain.handle("api:getTableIndexes", async (_event, serverName, dbName, tableName) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const driver = new MySQLDriver();
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        return await driver.getTableIndexes(dbName, tableName);
      }
      throw new Error("Server configuration missing");
    } finally {
      await driver.disconnect();
    }
  });
  ipcMain.handle("api:addIndex", async (_event, serverName, dbName, tableName, index) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const driver = new MySQLDriver();
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        await driver.addIndex(dbName, tableName, index);
      } else throw new Error("Server configuration missing");
    } finally {
      await driver.disconnect();
    }
  });
  ipcMain.handle("api:dropIndex", async (_event, serverName, dbName, tableName, indexName) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const driver = new MySQLDriver();
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        await driver.dropIndex(dbName, tableName, indexName);
      } else throw new Error("Server configuration missing");
    } finally {
      await driver.disconnect();
    }
  });
  ipcMain.handle("api:getTableForeignKeys", async (_event, serverName, dbName, tableName) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const driver = new MySQLDriver();
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        return await driver.getTableForeignKeys(dbName, tableName);
      }
      throw new Error("Server configuration missing");
    } finally {
      await driver.disconnect();
    }
  });
  ipcMain.handle("api:addForeignKey", async (_event, serverName, dbName, tableName, fk) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const driver = new MySQLDriver();
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        await driver.addForeignKey(dbName, tableName, fk);
      } else throw new Error("Server configuration missing");
    } finally {
      await driver.disconnect();
    }
  });
  ipcMain.handle("api:dropForeignKey", async (_event, serverName, dbName, tableName, fkName) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const driver = new MySQLDriver();
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        await driver.dropForeignKey(dbName, tableName, fkName);
      } else throw new Error("Server configuration missing");
    } finally {
      await driver.disconnect();
    }
  });
  ipcMain.handle("api:addColumn", async (_event, serverName, dbName, tableName, column, afterColumn) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const driver = new MySQLDriver();
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        await driver.addColumn(dbName, tableName, column, afterColumn);
      } else throw new Error("Server configuration missing");
    } finally {
      await driver.disconnect();
    }
  });
  ipcMain.handle("api:updateColumn", async (_event, serverName, dbName, tableName, oldName, column, afterColumn) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const driver = new MySQLDriver();
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        await driver.updateColumn(dbName, tableName, oldName, column, afterColumn);
      } else throw new Error("Server configuration missing");
    } finally {
      await driver.disconnect();
    }
  });
  ipcMain.handle("api:getTableCreateStatement", async (_event, serverName, dbName, tableName) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const driver = new MySQLDriver();
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: dbName });
        const statement = await driver.getTableCreateStatement(dbName, tableName);
        return { statement };
      }
      throw new Error("Server configuration missing");
    } finally {
      await driver.disconnect();
    }
  });
  ipcMain.handle("api:executeSql", async (_event, serverName, sql, database) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const driver = new MySQLDriver();
    try {
      if (server.config) {
        await driver.connect({ ...server.config, database: database || server.config.database });
        return await driver.executeQuery(sql);
      }
      throw new Error("Server configuration missing");
    } finally {
      await driver.disconnect();
    }
  });
  ipcMain.handle("api:getSupportedTypes", (_event, serverName) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    return new MySQLDriver().getSupportedTypes();
  });
  ipcMain.handle("api:tableMaintenanceOp", async (_event, serverName, dbName, tableName, op) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const ops = ["ANALYZE", "OPTIMIZE", "CHECK", "REPAIR"];
    if (!ops.includes(op.toUpperCase())) throw new Error("Invalid operation");
    const driver = new MySQLDriver();
    try {
      await driver.connect({ ...server.config, database: dbName });
      return await driver.executeQuery(`${op.toUpperCase()} TABLE \`${dbName}\`.\`${tableName}\``);
    } finally {
      await driver.disconnect();
    }
  });
  ipcMain.handle("api:getServerVariables", async (_event, serverName) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const driver = new MySQLDriver();
    try {
      await driver.connect(server.config);
      const variables = await driver.executeQuery("SHOW VARIABLES");
      const status = await driver.executeQuery("SHOW GLOBAL STATUS");
      return { variables, status };
    } finally {
      await driver.disconnect();
    }
  });
  ipcMain.handle("api:openFileDialog", async (_event, filters) => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters
    });
    if (canceled || !filePaths[0]) return null;
    const content = fs.readFileSync(filePaths[0], "utf-8");
    return { filePath: filePaths[0], content };
  });
  const SNIPPETS_FILE = path.join(CONFIG_DIR, "snippets.json");
  const getSnippets = () => {
    if (!fs.existsSync(SNIPPETS_FILE)) return [];
    try {
      return JSON.parse(fs.readFileSync(SNIPPETS_FILE, "utf-8"));
    } catch {
      return [];
    }
  };
  ipcMain.handle("api:getSnippets", () => getSnippets());
  ipcMain.handle("api:saveSnippet", (_event, snippet) => {
    const snippets = [snippet, ...getSnippets().filter((s) => s.id !== snippet.id)];
    fs.writeFileSync(SNIPPETS_FILE, JSON.stringify(snippets, null, 2));
  });
  ipcMain.handle("api:deleteSnippet", (_event, id) => {
    const snippets = getSnippets().filter((s) => s.id !== id);
    fs.writeFileSync(SNIPPETS_FILE, JSON.stringify(snippets, null, 2));
  });
  ipcMain.handle("api:getQueryHistory", () => getQueryHistory());
  ipcMain.handle("api:addQueryHistory", (_event, entry) => {
    addToQueryHistory(entry);
  });
  ipcMain.handle("api:clearQueryHistory", () => {
    fs.writeFileSync(QUERY_HISTORY_FILE, "[]");
  });
  ipcMain.handle("api:getProcessList", async (_event, serverName) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const driver = new MySQLDriver();
    try {
      await driver.connect(server.config);
      return await driver.executeQuery("SHOW PROCESSLIST");
    } finally {
      await driver.disconnect();
    }
  });
  ipcMain.handle("api:killProcess", async (_event, serverName, processId) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const driver = new MySQLDriver();
    try {
      await driver.connect(server.config);
      await driver.executeQuery(`KILL ${processId}`);
    } finally {
      await driver.disconnect();
    }
  });
  ipcMain.handle("api:saveExportFile", async (_event, defaultFilename, content, filters) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: "Save Export",
      defaultPath: defaultFilename,
      filters
    });
    if (canceled || !filePath) return { saved: false };
    fs.writeFileSync(filePath, content, "utf-8");
    return { saved: true, filePath };
  });
  ipcMain.handle("api:exportTableData", async (_event, serverName, dbName, tableName, format, filter, sort) => {
    const server = activeServers.find((s) => s.name === serverName);
    if (!server) throw new Error("Server not found");
    const ext = format === "csv" ? "csv" : "sql";
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: `Export ${tableName}`,
      defaultPath: `${tableName}.${ext}`,
      filters: format === "csv" ? [{ name: "CSV Files", extensions: ["csv"] }] : [{ name: "SQL Files", extensions: ["sql"] }]
    });
    if (canceled || !filePath) return { saved: false };
    const driver = new MySQLDriver();
    try {
      await driver.connect({ ...server.config, database: dbName });
      let allRows = [];
      let columns = [];
      let offset = 0;
      const chunk = 1e3;
      while (true) {
        const result = await driver.getTableData(dbName, tableName, chunk, offset, sort, filter);
        if (columns.length === 0) columns = result.columns;
        allRows = allRows.concat(result.rows);
        if (allRows.length >= result.total || result.rows.length === 0) break;
        offset += chunk;
      }
      const escId = (s) => "`" + s.replace(/`/g, "``") + "`";
      const escVal = (val) => {
        if (val === null) return "NULL";
        if (typeof val === "number") return String(val);
        if (typeof val === "boolean") return val ? "1" : "0";
        return "'" + String(val).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
      };
      const escCsv = (val) => {
        if (val === null) return "";
        const s = String(val);
        if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };
      let content = "";
      if (format === "csv") {
        content = columns.map(escCsv).join(",") + "\n";
        for (const row of allRows) {
          content += columns.map((col) => escCsv(row[col])).join(",") + "\n";
        }
      } else {
        const colList = columns.map(escId).join(", ");
        content = `-- Export of \`${dbName}\`.\`${tableName}\`
-- Generated by Arumu

`;
        for (const row of allRows) {
          const vals = columns.map((col) => escVal(row[col])).join(", ");
          content += `INSERT INTO ${escId(tableName)} (${colList}) VALUES (${vals});
`;
        }
      }
      fs.writeFileSync(filePath, content, "utf-8");
      return { saved: true, filePath };
    } finally {
      await driver.disconnect();
    }
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
//# sourceMappingURL=index.js.map
