import mysql, { Connection } from 'mysql2/promise';
import { IDatabaseDriver, ConnectionConfig, DatabaseInfo, TableInfo, TableDataResponse, SortConfig } from '@shared/types/database';

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
      } else {
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
      total: countRows[0].total
    };
  }

  async executeQuery(sql: string): Promise<any> {
    if (!this.connection) throw new Error('Not connected');
    const [result] = await this.connection.execute(sql);
    return result;
  }
}
