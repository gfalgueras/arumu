import mysql, { Connection } from 'mysql2/promise';
import { IDatabaseDriver, ConnectionConfig, DatabaseInfo, TableInfo, TableDataResponse, SortConfig, ColumnInfo, TableIndex, ForeignKey } from '@shared/types/database';

export class MySQLDriver implements IDatabaseDriver {
  private connection: Connection | null = null;

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
      this.connection.end();
      this.connection = null;
    }
  }

  async getDatabases(): Promise<DatabaseInfo[]> {
    if (!this.connection) throw new Error('Not connected');
    
    // Usamos SHOW DATABASES ya que es más fiable y simple para listar todas las BDs
    const [rows]: any = await this.connection.execute('SHOW DATABASES');
    
    return rows.map((row: any) => ({
      name: row.Database,
      tables: []
    }));
  }

  async getTables(database: string): Promise<TableInfo[]> {
    if (!this.connection) throw new Error('Not connected');
    
    const query = `
      SELECT 
        TABLE_NAME as name, 
        (DATA_LENGTH + INDEX_LENGTH) as size
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ?
    `;
    
    const [rows]: any = await this.connection.execute(query, [database]);
    
    return rows.map((row: any) => ({
      name: String(row.name || row.TABLE_NAME),
      size: Number(row.size !== undefined ? row.size : (Number(row.DATA_LENGTH || 0) + Number(row.INDEX_LENGTH || 0)))
    }));
  }

  async getSchema(database: string): Promise<Record<string, string[]>> {
    if (!this.connection) throw new Error('Not connected');

    const query = `
      SELECT TABLE_NAME, COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `;

    const [rows]: any = await this.connection.execute(query, [database]);
    
    const schema: Record<string, string[]> = {};
    rows.forEach((row: any) => {
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
  
  async getTableColumns(database: string, table: string): Promise<ColumnInfo[]> {
    if (!this.connection) throw new Error('Not connected');

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

    const [rows]: any = await this.connection.execute(query, [database, table]);
    
    return rows.map((row: any) => {
      // Función para obtener valor de forma insensible a mayúsculas
      const getValue = (obj: any, key: string) => {
        const foundKey = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
        return foundKey ? obj[foundKey] : undefined;
      };

      const extra = getValue(row, 'extra') || '';

      return {
        name: getValue(row, 'name'),
        type: getValue(row, 'type'),
        nullable: getValue(row, 'nullable') === 'YES',
        key: getValue(row, 'key'),
        default: getValue(row, 'default'),
        extra: extra,
        comment: getValue(row, 'comment'),
        collation: getValue(row, 'collation'),
        expression: getValue(row, 'expression'),
        virtuality: extra.includes('VIRTUAL') ? 'VIRTUAL' : (extra.includes('STORED') ? 'STORED' : '')
      };
    });
  }

  async getTableIndexes(database: string, table: string): Promise<TableIndex[]> {
    if (!this.connection) throw new Error('Not connected');

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

    const [rows]: any = await this.connection.execute(query, [database, table]);
    
    const indexesMap = new Map<string, TableIndex>();
    
    rows.forEach((row: any) => {
      const name = row.name;
      if (!indexesMap.has(name)) {
        indexesMap.set(name, {
          name,
          columns: [],
          unique: row.non_unique === 0,
          type: row.type
        });
      }
      indexesMap.get(name)!.columns.push(row.column_name);
    });

    return Array.from(indexesMap.values());
  }

  async getTableForeignKeys(database: string, table: string): Promise<ForeignKey[]> {
    if (!this.connection) throw new Error('Not connected');

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

    const [rows]: any = await this.connection.execute(query, [database, table]);
    
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
    if (!this.connection) throw new Error('Not connected');

    const escapedDb = database.replace(/`/g, '``');
    const escapedTable = table.replace(/`/g, '``');
    const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;

    const [rows]: any = await this.connection.execute(`SHOW CREATE TABLE ${fullTableName}`);
    
    if (rows && rows.length > 0) {
      // MySQL returns 'Table' and 'Create Table' columns
      const row = rows[0];
      const createTableKey = Object.keys(row).find(k => k.toLowerCase() === 'create table');
      return createTableKey ? row[createTableKey] : '';
    }
    
    return '';
  }

  async getTableData(database: string, table: string, limit: number, offset: number, sort?: SortConfig[], filter?: string): Promise<TableDataResponse> {
    if (!this.connection) throw new Error('Not connected');

    const escapedDb = database.replace(/`/g, '``');
    const escapedTable = table.replace(/`/g, '``');
    const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;

    // Get columns first to build the filter clause if needed
    const colQuery = `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`;
    const [colRows]: any = await this.connection.execute(colQuery, [database, table]);
    const columns = colRows.map((r: any) => r.COLUMN_NAME);

    let whereClause = '';
    const params: any[] = [];
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
        } else {
          whereClause = `WHERE ${trimmedFilter}`;
        }
        console.log(`[MySQLDriver] Using raw WHERE clause: ${whereClause}`);
      } else if (columns.length > 0) {
        const searchTerms = columns.map((col: string) => `\`${col.replace(/`/g, '``')}\` LIKE ?`).join(' OR ');
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
    
    const [rows]: any = await this.connection.execute(query, params);
    const [countRows]: any = await this.connection.execute(countQuery, params);

    return {
      columns,
      rows,
      total: (countRows && countRows[0]) ? Number(countRows[0].total) : 0
    };
  }

  async executeQuery(sql: string): Promise<any> {
    if (!this.connection) throw new Error('Not connected');
    const [result] = await this.connection.execute(sql);
    return result;
  }
}
