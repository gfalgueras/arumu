export interface TableInfo {
  name: string;
  size?: number; // Size in bytes
}

export interface DatabaseInfo {
  name: string;
  tables: TableInfo[];
  size?: number; // Total size in bytes
}

export interface ServerInfo {
  id: string;
  name: string;
  type: 'mysql' | 'postgres' | 'sqlite';
  databases?: DatabaseInfo[];
  config?: ConnectionConfig;
}

export interface StoredServer {
  id: string;
  name: string;
  type: 'mysql' | 'postgres' | 'sqlite';
  config: ConnectionConfig;
}

export interface ConnectionConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database?: string;
  defaultFilter?: string; // Comma separated list of databases to hide
}

export interface TableDataResponse {
  columns: string[];
  rows: any[];
  total: number;
}

export interface SortConfig {
  column: string;
  direction: 'ASC' | 'DESC';
}

export interface IDatabaseDriver {
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  getDatabases(): Promise<DatabaseInfo[]>;
  getTables(database: string): Promise<TableInfo[]>;
  getTableData(database: string, table: string, limit: number, offset: number, sort?: SortConfig[]): Promise<TableDataResponse>;
  executeQuery(sql: string): Promise<any>;
}
