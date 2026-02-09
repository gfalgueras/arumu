"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MySQLDriver = void 0;
const promise_1 = __importDefault(require("mysql2/promise"));
class MySQLDriver {
    connection = null;
    async connect(config) {
        this.connection = await promise_1.default.createConnection({
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
            this.connection.end();
            this.connection = null;
        }
    }
    async getDatabases() {
        if (!this.connection)
            throw new Error('Not connected');
        // Usamos SHOW DATABASES ya que es más fiable y simple para listar todas las BDs
        const [rows] = await this.connection.execute('SHOW DATABASES');
        return rows.map((row) => ({
            name: row.Database,
            tables: []
        }));
    }
    async getTables(database) {
        if (!this.connection)
            throw new Error('Not connected');
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
            size: Number(row.size !== undefined ? row.size : (Number(row.DATA_LENGTH || 0) + Number(row.INDEX_LENGTH || 0)))
        }));
    }
    async getSchema(database) {
        if (!this.connection)
            throw new Error('Not connected');
        const query = `
      SELECT TABLE_NAME, COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `;
        const [rows] = await this.connection.execute(query, [database]);
        const schema = {};
        rows.forEach((row) => {
            // Usar búsqueda insensible a mayúsculas para las columnas de information_schema
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
        if (!this.connection)
            throw new Error('Not connected');
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
            // Función para obtener valor de forma insensible a mayúsculas
            const getValue = (obj, key) => {
                const foundKey = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
                return foundKey ? obj[foundKey] : undefined;
            };
            const extra = getValue(row, 'extra') || '';
            const fullType = getValue(row, 'type') || '';
            const unsigned = fullType.toLowerCase().includes('unsigned');
            const typeMatch = fullType.match(/^([a-z]+)(?:\(([^)]+)\))?/i);
            const type = typeMatch ? typeMatch[1].toUpperCase() : fullType.split(' ')[0].toUpperCase();
            const length = typeMatch ? typeMatch[2] : null;
            return {
                name: getValue(row, 'name'),
                type: type,
                length: length,
                nullable: getValue(row, 'nullable') === 'YES',
                key: getValue(row, 'key'),
                default: getValue(row, 'default'),
                extra: extra,
                comment: getValue(row, 'comment'),
                collation: getValue(row, 'collation'),
                expression: getValue(row, 'expression'),
                virtuality: extra.includes('VIRTUAL') ? 'VIRTUAL' : (extra.includes('STORED') ? 'STORED' : ''),
                unsigned: unsigned
            };
        });
    }
    async getTableIndexes(database, table) {
        if (!this.connection)
            throw new Error('Not connected');
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
        const indexesMap = new Map();
        rows.forEach((row) => {
            const name = row.name;
            if (!indexesMap.has(name)) {
                let trueType = 'INDEX';
                if (name === 'PRIMARY') {
                    trueType = 'PRIMARY';
                }
                else if (row.type === 'FULLTEXT') {
                    trueType = 'FULLTEXT';
                }
                else if (row.type === 'SPATIAL') {
                    trueType = 'SPATIAL';
                }
                else if (row.non_unique === 0) {
                    trueType = 'UNIQUE';
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
        if (!this.connection)
            throw new Error('Not connected');
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
        const fksMap = new Map();
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
        if (!this.connection)
            throw new Error('Not connected');
        const escapedDb = database.replace(/`/g, '``');
        const escapedTable = table.replace(/`/g, '``');
        const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
        const [rows] = await this.connection.execute(`SHOW CREATE TABLE ${fullTableName}`);
        if (rows && rows.length > 0) {
            // MySQL returns 'Table' and 'Create Table' columns
            const row = rows[0];
            const createTableKey = Object.keys(row).find(k => k.toLowerCase() === 'create table');
            return createTableKey ? row[createTableKey] : '';
        }
        return '';
    }
    async getTableData(database, table, limit, offset, sort, filter) {
        if (!this.connection)
            throw new Error('Not connected');
        const escapedDb = database.replace(/`/g, '``');
        const escapedTable = table.replace(/`/g, '``');
        const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
        // Get columns first to build the filter clause if needed
        const colQuery = `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`;
        const [colRows] = await this.connection.execute(colQuery, [database, table]);
        const columns = colRows.map((r) => r.COLUMN_NAME);
        let whereClause = '';
        const params = [];
        if (filter && columns.length > 0) {
            const trimmedFilter = filter.trim();
            const lowerFilter = trimmedFilter.toLowerCase();
            // Check if it looks like a raw WHERE condition
            const isRawWhere = lowerFilter.startsWith('where ') ||
                lowerFilter.includes('=') ||
                lowerFilter.includes('>') ||
                lowerFilter.includes('<') ||
                lowerFilter.includes(' like ') ||
                lowerFilter.includes(' is null') ||
                lowerFilter.includes(' is not null') ||
                lowerFilter.includes(' between ') ||
                lowerFilter.includes(' in (');
            if (isRawWhere) {
                if (lowerFilter.startsWith('where ')) {
                    whereClause = trimmedFilter;
                }
                else {
                    whereClause = `WHERE ${trimmedFilter}`;
                }
                console.log(`[MySQLDriver] Using raw WHERE clause: ${whereClause}`);
            }
            else if (columns.length > 0) {
                const searchTerms = columns.map((col) => `\`${col.replace(/`/g, '``')}\` LIKE ?`).join(' OR ');
                whereClause = `WHERE ${searchTerms}`;
                const filterValue = `%${filter}%`;
                columns.forEach(() => params.push(filterValue));
                console.log(`[MySQLDriver] Using search filter: ${filter}`);
            }
        }
        let orderBy = '';
        if (sort && sort.length > 0) {
            orderBy = 'ORDER BY ' + sort.map(s => `\`${s.column.replace(/`/g, '``')}\` ${s.direction}`).join(', ');
        }
        const query = `SELECT * FROM ${fullTableName} ${whereClause} ${orderBy} LIMIT ${limit} OFFSET ${offset}`;
        const countQuery = `SELECT COUNT(*) as total FROM ${fullTableName} ${whereClause}`;
        console.log(`[MySQLDriver] Executing query: ${query}`);
        const [rows] = await this.connection.execute(query, params);
        const [countRows] = await this.connection.execute(countQuery, params);
        return {
            columns,
            rows,
            total: (countRows && countRows[0]) ? Number(countRows[0].total) : 0
        };
    }
    async executeQuery(sql) {
        if (!this.connection)
            throw new Error('Not connected');
        const [result] = await this.connection.execute(sql);
        return result;
    }
    async addIndex(database, table, index) {
        if (!this.connection)
            throw new Error('Not connected');
        const escapedDb = database.replace(/`/g, '``');
        const escapedTable = table.replace(/`/g, '``');
        const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
        const columns = index.columns.map(col => `\`${col.replace(/`/g, '``')}\``).join(', ');
        let indexKeyword = 'INDEX';
        if (index.type === 'UNIQUE')
            indexKeyword = 'UNIQUE INDEX';
        else if (index.type === 'FULLTEXT')
            indexKeyword = 'FULLTEXT INDEX';
        else if (index.type === 'SPATIAL')
            indexKeyword = 'SPATIAL INDEX';
        else if (index.type === 'PRIMARY')
            indexKeyword = 'PRIMARY KEY';
        const indexName = (index.name && index.type !== 'PRIMARY') ? `\`${index.name.replace(/`/g, '``')}\`` : '';
        let sql = '';
        if (index.type === 'PRIMARY') {
            sql = `ALTER TABLE ${fullTableName} ADD PRIMARY KEY (${columns})`;
        }
        else if (indexName) {
            sql = `CREATE ${indexKeyword} ${indexName} ON ${fullTableName} (${columns})`;
        }
        else {
            sql = `ALTER TABLE ${fullTableName} ADD ${indexKeyword} (${columns})`;
        }
        await this.connection.execute(sql);
    }
    async addForeignKey(database, table, fk) {
        if (!this.connection)
            throw new Error('Not connected');
        const escapedDb = database.replace(/`/g, '``');
        const escapedTable = table.replace(/`/g, '``');
        const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
        const columns = fk.columns.map(col => `\`${col.replace(/`/g, '``')}\``).join(', ');
        const refTable = `\`${escapedDb}\`.\`${fk.referencedTable.replace(/`/g, '``')}\``;
        const refColumns = fk.referencedColumns.map(col => `\`${col.replace(/`/g, '``')}\``).join(', ');
        const constraintName = fk.name ? `CONSTRAINT \`${fk.name.replace(/`/g, '``')}\`` : '';
        let sql = `ALTER TABLE ${fullTableName} ADD ${constraintName} FOREIGN KEY (${columns}) REFERENCES ${refTable} (${refColumns})`;
        if (fk.updateRule) {
            sql += ` ON UPDATE ${fk.updateRule}`;
        }
        if (fk.deleteRule) {
            sql += ` ON DELETE ${fk.deleteRule}`;
        }
        await this.connection.execute(sql);
    }
    async dropIndex(database, table, indexName) {
        if (!this.connection)
            throw new Error('Not connected');
        const escapedDb = database.replace(/`/g, '``');
        const escapedTable = table.replace(/`/g, '``');
        const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
        // For primary keys, the name is ignored and we use DROP PRIMARY KEY
        if (indexName === 'PRIMARY') {
            await this.connection.execute(`ALTER TABLE ${fullTableName} DROP PRIMARY KEY`);
        }
        else {
            await this.connection.execute(`ALTER TABLE ${fullTableName} DROP INDEX \`${indexName.replace(/`/g, '``')}\``);
        }
    }
    async dropForeignKey(database, table, fkName) {
        if (!this.connection)
            throw new Error('Not connected');
        const escapedDb = database.replace(/`/g, '``');
        const escapedTable = table.replace(/`/g, '``');
        const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
        await this.connection.execute(`ALTER TABLE ${fullTableName} DROP FOREIGN KEY \`${fkName.replace(/`/g, '``')}\``);
    }
    async addColumn(database, table, column, afterColumn) {
        if (!this.connection)
            throw new Error('Not connected');
        const escapedDb = database.replace(/`/g, '``');
        const escapedTable = table.replace(/`/g, '``');
        const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
        const newColName = `\`${column.name.replace(/`/g, '``')}\``;
        let columnType = column.type;
        if (column.length) {
            columnType += `(${column.length})`;
        }
        let sql = `ALTER TABLE ${fullTableName} ADD COLUMN ${newColName} ${columnType}`;
        if (column.unsigned) {
            sql += ' UNSIGNED';
        }
        if (!column.nullable) {
            sql += ' NOT NULL';
        }
        else {
            sql += ' NULL';
        }
        if (column.default !== undefined) {
            if (column.default === null) {
                sql += ' DEFAULT NULL';
            }
            else if (column.default.toUpperCase() === 'CURRENT_TIMESTAMP') {
                sql += ' DEFAULT CURRENT_TIMESTAMP';
            }
            else {
                sql += ` DEFAULT '${column.default.replace(/'/g, "''")}'`;
            }
        }
        if (column.extra) {
            sql += ` ${column.extra}`;
        }
        if (column.comment) {
            sql += ` COMMENT '${column.comment.replace(/'/g, "''")}'`;
        }
        if (afterColumn !== undefined) {
            if (afterColumn === '') {
                sql += ' FIRST';
            }
            else {
                sql += ` AFTER \`${afterColumn.replace(/`/g, '``')}\``;
            }
        }
        await this.connection.execute(sql);
    }
    async updateColumn(database, table, oldColumnName, newColumn, afterColumn) {
        if (!this.connection)
            throw new Error('Not connected');
        const escapedDb = database.replace(/`/g, '``');
        const escapedTable = table.replace(/`/g, '``');
        const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
        const oldColName = `\`${oldColumnName.replace(/`/g, '``')}\``;
        const newColName = `\`${newColumn.name.replace(/`/g, '``')}\``;
        let columnType = newColumn.type;
        if (newColumn.length) {
            columnType += `(${newColumn.length})`;
        }
        let sql = `ALTER TABLE ${fullTableName} CHANGE COLUMN ${oldColName} ${newColName} ${columnType}`;
        if (newColumn.unsigned) {
            sql += ' UNSIGNED';
        }
        if (!newColumn.nullable) {
            sql += ' NOT NULL';
        }
        else {
            sql += ' NULL';
        }
        if (newColumn.default !== undefined) {
            if (newColumn.default === null) {
                sql += ' DEFAULT NULL';
            }
            else if (newColumn.default.toUpperCase() === 'CURRENT_TIMESTAMP') {
                sql += ' DEFAULT CURRENT_TIMESTAMP';
            }
            else {
                sql += ` DEFAULT '${newColumn.default.replace(/'/g, "''")}'`;
            }
        }
        if (newColumn.extra) {
            sql += ` ${newColumn.extra}`;
        }
        if (newColumn.comment) {
            sql += ` COMMENT '${newColumn.comment.replace(/'/g, "''")}'`;
        }
        if (afterColumn !== undefined) {
            if (afterColumn === '') {
                sql += ' FIRST';
            }
            else {
                sql += ` AFTER \`${afterColumn.replace(/`/g, '``')}\``;
            }
        }
        await this.connection.execute(sql);
    }
    async getSupportedTypes() {
        return [
            {
                group: 'Entero',
                types: ['TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'BIGINT', 'BIT']
            },
            {
                group: 'Real',
                types: ['DECIMAL', 'FLOAT', 'DOUBLE']
            },
            {
                group: 'Texto',
                types: ['CHAR', 'VARCHAR', 'TINYTEXT', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT']
            },
            {
                group: 'Binario',
                types: ['BINARY', 'VARBINARY', 'TINYBLOB', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB']
            },
            {
                group: 'Tiempo',
                types: ['DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR']
            },
            {
                group: 'Geometria',
                types: ['GEOMETRY', 'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON', 'GEOMETRYCOLLECTION']
            },
            {
                group: 'Otros',
                types: ['ENUM', 'SET', 'JSON']
            }
        ];
    }
}
exports.MySQLDriver = MySQLDriver;
