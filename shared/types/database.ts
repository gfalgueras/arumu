export interface TableInfo {
  name: string;
  size?: number; // Size in bytes
  columns?: string[];
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

export interface AppState {
  activeServerIds: string[];
  selectedServerId: string | null;
  selectedDatabase: string | null;
  selectedTable: string | null;
  activeTab: 'data' | 'query';
  sidebarWidth: number;
  dbFilter: string;
  tableFilter: string;
  expandedServerIds: string[];
  expandedDatabaseIds: string[]; // Formato "serverId:dbName"
}

export interface IDatabaseDriver {
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  getDatabases(): Promise<DatabaseInfo[]>;
  getTables(database: string): Promise<TableInfo[]>;
  getSchema(database: string): Promise<Record<string, string[]>>;
  getTableData(database: string, table: string, limit: number, offset: number, sort?: SortConfig[], filter?: string): Promise<TableDataResponse>;
  executeQuery(sql: string): Promise<any>;
}
