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
      database: config.database
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

  async getTableData(database: string, table: string, limit: number, offset: number, sort?: SortConfig[]): Promise<TableDataResponse> {
    if (!this.connection) throw new Error('Not connected');

    // Escapar nombres de tabla y base de datos para evitar inyección SQL básica
    // Nota: En una app real usaríamos una librería más robusta para esto.
    const escapedDb = database.replace(/`/g, '``');
    const escapedTable = table.replace(/`/g, '``');
    const fullTableName = `\`${escapedDb}\`.\`${escapedTable}\``;

    let orderBy = '';
    if (sort && sort.length > 0) {
      orderBy = 'ORDER BY ' + sort.map(s => `\`${s.column.replace(/`/g, '``')}\` ${s.direction}`).join(', ');
    }

    const query = `SELECT * FROM ${fullTableName} ${orderBy} LIMIT ${limit} OFFSET ${offset}`;
    const countQuery = `SELECT COUNT(*) as total FROM ${fullTableName}`;

    const [rows]: any = await this.connection.execute(query);
    const [countRows]: any = await this.connection.execute(countQuery);

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    // Si no hay filas, intentamos obtener las columnas de information_schema
    if (columns.length === 0) {
      const colQuery = `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`;
      const [colRows]: any = await this.connection.execute(colQuery, [database, table]);
      colRows.forEach((r: any) => columns.push(r.COLUMN_NAME));
    }

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
