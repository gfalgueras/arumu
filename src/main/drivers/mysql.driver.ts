import mysql, { Connection } from 'mysql2/promise';
import { IDatabaseDriver, ConnectionConfig, DatabaseInfo, TableInfo, TableDataResponse, SortConfig, ColumnInfo, TableIndex, ForeignKey, TypeGroup, ServerCapabilities, ServerVariablesResult } from '@shared/types/database';

export class MySQLDriver implements IDatabaseDriver {
  private connection: Connection | null = null;

  static queryLogger: ((sql: string, durationMs: number, error?: string) => void) | null = null;

  private async exec(sql: string, params?: any[]): Promise<any> {
    if (!this.connection) throw new Error('Not connected');
    const t0 = Date.now();
    try {
      const result = params !== undefined
        ? await this.connection.execute(sql, params)
        : await this.connection.execute(sql);
      MySQLDriver.queryLogger?.(sql, Date.now() - t0);
      return result;
    } catch (err: any) {
      MySQLDriver.queryLogger?.(sql, Date.now() - t0, err.sqlMessage || err.message || String(err));
      throw err;
    }
  }

  async connect(config: ConnectionConfig): Promise<void> {
    this.connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      dateStrings: true
    });
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }

  async getDatabases(): Promise<DatabaseInfo[]> {
    const [rows]: any = await this.exec('SHOW DATABASES');
    return rows.map((row: any) => ({
      name: row.Database,
      tables: []
    }));
  }

  async getTables(database: string): Promise<TableInfo[]> {
    const query = `
      SELECT
        TABLE_NAME as name,
        (DATA_LENGTH + INDEX_LENGTH) as size
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
    `;
    const [rows]: any = await this.exec(query, [database]);
    return rows.map((row: any) => ({
      name: String(row.name || row.TABLE_NAME),
      size: Number(row.size !== undefined ? row.size : (Number(row.DATA_LENGTH || 0) + Number(row.INDEX_LENGTH || 0)))
    }));
  }

  async getSchema(database: string): Promise<Record<string, string[]>> {
    const query = `
      SELECT TABLE_NAME, COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `;
    const [rows]: any = await this.exec(query, [database]);
    const schema: Record<string, string[]> = {};
    rows.forEach((row: any) => {
      const tableName = row.TABLE_NAME || row.table_name || row.TableName;
      const columnName = row.COLUMN_NAME || row.column_name || row.ColumnName;
      if (tableName && columnName) {
        if (!schema[tableName]) schema[tableName] = [];
        schema[tableName].push(columnName);
      }
    });
    return schema;
  }

  async getTableColumns(database: string, table: string): Promise<ColumnInfo[]> {
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
    const [rows]: any = await this.exec(query, [database, table]);
    return rows.map((row: any) => {
      const getValue = (obj: any, key: string) => {
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
        type,
        length,
        nullable: getValue(row, 'nullable') === 'YES',
        key: getValue(row, 'key'),
        default: getValue(row, 'default'),
        extra,
        comment: getValue(row, 'comment'),
        collation: getValue(row, 'collation'),
        expression: getValue(row, 'expression'),
        virtuality: extra.includes('VIRTUAL') ? 'VIRTUAL' : (extra.includes('STORED') ? 'STORED' : ''),
        unsigned
      };
    });
  }

  async getTableIndexes(database: string, table: string): Promise<TableIndex[]> {
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
    const [rows]: any = await this.exec(query, [database, table]);
    const indexesMap = new Map<string, TableIndex>();
    rows.forEach((row: any) => {
      const name = row.name;
      if (!indexesMap.has(name)) {
        let trueType = 'INDEX';
        if (name === 'PRIMARY') trueType = 'PRIMARY';
        else if (row.type === 'FULLTEXT') trueType = 'FULLTEXT';
        else if (row.type === 'SPATIAL') trueType = 'SPATIAL';
        else if (row.non_unique === 0) trueType = 'UNIQUE';
        indexesMap.set(name, {
          name,
          columns: [],
          unique: row.non_unique === 0,
          type: trueType,
          method: row.type
        });
      }
      indexesMap.get(name)!.columns.push(row.column_name);
    });
    return Array.from(indexesMap.values());
  }

  async getTableForeignKeys(database: string, table: string): Promise<ForeignKey[]> {
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
    const [rows]: any = await this.exec(query, [database, table]);
    const fksMap = new Map<string, ForeignKey>();
    rows.forEach((row: any) => {
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
      fksMap.get(name)!.columns.push(row.column_name);
      fksMap.get(name)!.referencedColumns.push(row.referenced_column);
    });
    return Array.from(fksMap.values());
  }

  async getTableCreateStatement(database: string, table: string): Promise<string> {
    const escapedDb = database.replace(/`/g, '``');
    const escapedTable = table.replace(/`/g, '``');
    const [rows]: any = await this.exec(`SHOW CREATE TABLE \`${escapedDb}\`.\`${escapedTable}\``);
    if (rows && rows.length > 0) {
      const row = rows[0];
      const createTableKey = Object.keys(row).find(k => k.toLowerCase() === 'create table');
      return createTableKey ? row[createTableKey] : '';
    }
    return '';
  }

  async getTableData(database: string, table: string, limit: number, offset: number, sort?: SortConfig[], filter?: string): Promise<TableDataResponse> {
    const escapedDb = database.replace(/`/g, '``');
    const escapedTable = table.replace(/`/g, '``');
    const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;

    const colQuery = `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`;
    const [colRows]: any = await this.exec(colQuery, [database, table]);
    const columns = colRows.map((r: any) => r.COLUMN_NAME);

    let whereClause = '';
    const params: any[] = [];
    if (filter && columns.length > 0) {
      const trimmedFilter = filter.trim();
      const lowerFilter = trimmedFilter.toLowerCase();
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
        whereClause = lowerFilter.startsWith('where ') ? trimmedFilter : `WHERE ${trimmedFilter}`;
      } else if (columns.length > 0) {
        const searchTerms = columns.map((col: string) => `\`${col.replace(/`/g, '``')}\` LIKE ?`).join(' OR ');
        whereClause = `WHERE ${searchTerms}`;
        const filterValue = `%${filter}%`;
        columns.forEach(() => params.push(filterValue));
      }
    }

    let orderBy = '';
    if (sort && sort.length > 0) {
      orderBy = 'ORDER BY ' + sort.map(s => `\`${s.column.replace(/`/g, '``')}\` ${s.direction}`).join(', ');
    }

    const safeLimit = Math.max(1, Math.floor(Number(limit)));
    const safeOffset = Math.max(0, Math.floor(Number(offset)));

    const query = `SELECT * FROM ${fullTableName} ${whereClause} ${orderBy} LIMIT ${safeLimit} OFFSET ${safeOffset}`;
    const countQuery = `SELECT COUNT(*) as total FROM ${fullTableName} ${whereClause}`;

    const [[rows], [countRows]]: any = await Promise.all([
      this.exec(query, params),
      this.exec(countQuery, params)
    ]);

    const cleanRows = JSON.parse(JSON.stringify(rows, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));

    return {
      columns,
      rows: cleanRows,
      total: (countRows && countRows[0]) ? Number(countRows[0].total) : 0
    };
  }

  async executeQuery(sql: string): Promise<any> {
    const [result]: any = await this.exec(sql);
    return JSON.parse(JSON.stringify(result, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));
  }

  async addIndex(database: string, table: string, index: TableIndex): Promise<void> {
    const escapedDb = database.replace(/`/g, '``');
    const escapedTable = table.replace(/`/g, '``');
    const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
    const columns = index.columns.map(col => `\`${col.replace(/`/g, '``')}\``).join(', ');
    let indexKeyword = 'INDEX';
    if (index.type === 'UNIQUE') indexKeyword = 'UNIQUE INDEX';
    else if (index.type === 'FULLTEXT') indexKeyword = 'FULLTEXT INDEX';
    else if (index.type === 'SPATIAL') indexKeyword = 'SPATIAL INDEX';
    else if (index.type === 'PRIMARY') indexKeyword = 'PRIMARY KEY';
    const indexName = (index.name && index.type !== 'PRIMARY') ? `\`${index.name.replace(/`/g, '``')}\`` : '';
    let sql = '';
    if (index.type === 'PRIMARY') {
      sql = `ALTER TABLE ${fullTableName} ADD PRIMARY KEY (${columns})`;
    } else if (indexName) {
      sql = `CREATE ${indexKeyword} ${indexName} ON ${fullTableName} (${columns})`;
    } else {
      sql = `ALTER TABLE ${fullTableName} ADD ${indexKeyword} (${columns})`;
    }
    await this.exec(sql);
  }

  async addForeignKey(database: string, table: string, fk: ForeignKey): Promise<void> {
    const escapedDb = database.replace(/`/g, '``');
    const escapedTable = table.replace(/`/g, '``');
    const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
    const columns = fk.columns.map(col => `\`${col.replace(/`/g, '``')}\``).join(', ');
    const refTable = `\`${escapedDb}\`.\`${fk.referencedTable.replace(/`/g, '``')}\``;
    const refColumns = fk.referencedColumns.map(col => `\`${col.replace(/`/g, '``')}\``).join(', ');
    const constraintName = fk.name ? `CONSTRAINT \`${fk.name.replace(/`/g, '``')}\`` : '';
    const ALLOWED_FK_RULES = ['CASCADE', 'NO ACTION', 'RESTRICT', 'SET NULL', 'SET DEFAULT'];
    const updateRule = (fk.updateRule || '').toUpperCase();
    const deleteRule = (fk.deleteRule || '').toUpperCase();
    if (fk.updateRule && !ALLOWED_FK_RULES.includes(updateRule)) throw new Error(`Invalid ON UPDATE rule: ${fk.updateRule}`);
    if (fk.deleteRule && !ALLOWED_FK_RULES.includes(deleteRule)) throw new Error(`Invalid ON DELETE rule: ${fk.deleteRule}`);
    let sql = `ALTER TABLE ${fullTableName} ADD ${constraintName} FOREIGN KEY (${columns}) REFERENCES ${refTable} (${refColumns})`;
    if (fk.updateRule) sql += ` ON UPDATE ${updateRule}`;
    if (fk.deleteRule) sql += ` ON DELETE ${deleteRule}`;
    await this.exec(sql);
  }

  async dropIndex(database: string, table: string, indexName: string): Promise<void> {
    const escapedDb = database.replace(/`/g, '``');
    const escapedTable = table.replace(/`/g, '``');
    const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
    if (indexName === 'PRIMARY') {
      await this.exec(`ALTER TABLE ${fullTableName} DROP PRIMARY KEY`);
    } else {
      await this.exec(`ALTER TABLE ${fullTableName} DROP INDEX \`${indexName.replace(/`/g, '``')}\``);
    }
  }

  async dropForeignKey(database: string, table: string, fkName: string): Promise<void> {
    const escapedDb = database.replace(/`/g, '``');
    const escapedTable = table.replace(/`/g, '``');
    const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
    await this.exec(`ALTER TABLE ${fullTableName} DROP FOREIGN KEY \`${fkName.replace(/`/g, '``')}\``);
  }

  async addColumn(database: string, table: string, column: ColumnInfo, afterColumn?: string): Promise<void> {
    const escapedDb = database.replace(/`/g, '``');
    const escapedTable = table.replace(/`/g, '``');
    const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
    const newColName = `\`${column.name.replace(/`/g, '``')}\``;
    let columnType = column.type;
    if (column.length) columnType += `(${column.length})`;
    let sql = `ALTER TABLE ${fullTableName} ADD COLUMN ${newColName} ${columnType}`;
    if (column.unsigned) sql += ' UNSIGNED';
    if (!column.nullable) sql += ' NOT NULL'; else sql += ' NULL';
    if (column.default !== undefined) {
      if (column.default === null) sql += ' DEFAULT NULL';
      else if (column.default.toUpperCase() === 'CURRENT_TIMESTAMP') sql += ' DEFAULT CURRENT_TIMESTAMP';
      else sql += ` DEFAULT '${column.default.replace(/'/g, "''")}'`;
    }
    if (column.extra) {
      const ALLOWED_EXTRAS = ['AUTO_INCREMENT', 'ON UPDATE CURRENT_TIMESTAMP', 'DEFAULT_GENERATED', 'DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP'];
      const extraUpper = column.extra.toUpperCase().trim();
      if (!ALLOWED_EXTRAS.includes(extraUpper)) throw new Error(`Invalid column extra value: ${column.extra}`);
      sql += ` ${extraUpper}`;
    }
    if (column.comment) sql += ` COMMENT '${column.comment.replace(/'/g, "''")}'`;
    if (afterColumn !== undefined) {
      if (afterColumn === '') sql += ' FIRST';
      else sql += ` AFTER \`${afterColumn.replace(/`/g, '``')}\``;
    }
    await this.exec(sql);
  }

  async updateColumn(database: string, table: string, oldColumnName: string, newColumn: ColumnInfo, afterColumn?: string): Promise<void> {
    const escapedDb = database.replace(/`/g, '``');
    const escapedTable = table.replace(/`/g, '``');
    const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;
    const oldColName = `\`${oldColumnName.replace(/`/g, '``')}\``;
    const newColName = `\`${newColumn.name.replace(/`/g, '``')}\``;
    let columnType = newColumn.type;
    if (newColumn.length) columnType += `(${newColumn.length})`;
    let sql = `ALTER TABLE ${fullTableName} CHANGE COLUMN ${oldColName} ${newColName} ${columnType}`;
    if (newColumn.unsigned) sql += ' UNSIGNED';
    if (!newColumn.nullable) sql += ' NOT NULL'; else sql += ' NULL';
    if (newColumn.default !== undefined) {
      if (newColumn.default === null) sql += ' DEFAULT NULL';
      else if (newColumn.default.toUpperCase() === 'CURRENT_TIMESTAMP') sql += ' DEFAULT CURRENT_TIMESTAMP';
      else sql += ` DEFAULT '${newColumn.default.replace(/'/g, "''")}'`;
    }
    if (newColumn.extra) {
      const ALLOWED_EXTRAS = ['AUTO_INCREMENT', 'ON UPDATE CURRENT_TIMESTAMP', 'DEFAULT_GENERATED', 'DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP'];
      const extraUpper = newColumn.extra.toUpperCase().trim();
      if (!ALLOWED_EXTRAS.includes(extraUpper)) throw new Error(`Invalid column extra value: ${newColumn.extra}`);
      sql += ` ${extraUpper}`;
    }
    if (newColumn.comment) sql += ` COMMENT '${newColumn.comment.replace(/'/g, "''")}'`;
    if (afterColumn !== undefined) {
      if (afterColumn === '') sql += ' FIRST';
      else sql += ` AFTER \`${afterColumn.replace(/`/g, '``')}\``;
    }
    await this.exec(sql);
  }

  async getSupportedTypes(): Promise<TypeGroup[]> {
    return [
      { group: 'Entero', types: ['TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'BIGINT', 'BIT'] },
      { group: 'Real', types: ['DECIMAL', 'FLOAT', 'DOUBLE'] },
      { group: 'Texto', types: ['CHAR', 'VARCHAR', 'TINYTEXT', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT'] },
      { group: 'Binario', types: ['BINARY', 'VARBINARY', 'TINYBLOB', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB'] },
      { group: 'Tiempo', types: ['DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR'] },
      { group: 'Geometria', types: ['GEOMETRY', 'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON', 'GEOMETRYCOLLECTION'] },
      { group: 'Otros', types: ['ENUM', 'SET', 'JSON'] }
    ];
  }

  escapeIdentifier(name: string): string {
    return '`' + name.replace(/`/g, '``') + '`';
  }

  escapeStringLiteral(val: string): string {
    return "'" + val.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  }

  async runTableMaintenance(database: string, table: string, op: string): Promise<any> {
    const db = this.escapeIdentifier(database);
    const tbl = this.escapeIdentifier(table);
    return this.executeQuery(`${op.toUpperCase()} TABLE ${db}.${tbl}`);
  }

  getCapabilities(): ServerCapabilities {
    return {
      supportsUnsigned: true,
      supportsVirtuality: true,
      supportsCollation: true,
      supportsColumnComment: true,
      supportsFullTextIndex: true,
      supportsSpatialIndex: true,
      supportsProcessList: true,
      supportsServerVariables: true,
      supportsTableMaintenance: true,
      maintenanceOps: ['ANALYZE', 'OPTIMIZE', 'CHECK', 'REPAIR'],
      indexTypes: ['PRIMARY', 'UNIQUE', 'INDEX', 'FULLTEXT', 'SPATIAL'],
      processIdField: 'Id',
    };
  }

  async getProcessList(): Promise<any[]> {
    const [rows]: any = await this.exec('SHOW PROCESSLIST');
    return rows;
  }

  async killProcess(processId: number | string): Promise<void> {
    await this.exec(`KILL ${Number(processId)}`);
  }

  async getServerVariables(): Promise<ServerVariablesResult> {
    const [vars]: any = await this.exec('SHOW VARIABLES');
    const [stat]: any = await this.exec('SHOW GLOBAL STATUS');
    const normalize = (rows: any[]) => rows.map((r: any) => ({
      name: r.Variable_name ?? r.variable_name ?? r.Name ?? '',
      value: String(r.Value ?? r.value ?? ''),
    }));
    return { variables: normalize(vars), status: normalize(stat) };
  }
}
