export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  key?: string;
  default?: string | null;
  extra?: string;
  comment?: string;
  collation?: string;
  expression?: string;
  virtuality?: string;
  unsigned?: boolean;
  length?: string | number | null;
  _id?: string;
}

export interface TableIndex {
  name: string;
  columns: string[];
  unique: boolean;
  type: string;
  method?: string;
}

export interface ForeignKey {
  name: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  updateRule?: string;
  deleteRule?: string;
}

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
  name: string;
  type: 'mysql' | 'postgres' | 'sqlite';
  databases?: DatabaseInfo[];
  config?: ConnectionConfig;
}

export interface StoredServer {
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
  activeServerNames: string[];
  selectedServerName: string | null;
  selectedDatabase: string | null;
  selectedTable: string | null;
  activeTab: string;
  queryTabs: { id: string; name: string; query: string }[];
  sidebarWidth: number;
  queryEditorHeight?: number;
  tableSchemaHeight?: number;
  dbFilter: string;
  tableFilter: string;
  expandedServerNames: string[];
  expandedDatabaseIds: string[]; // Formato "serverName:dbName"
  expandedTableIds: string[]; // Formato "serverName:dbName:tableName"
}

export interface TypeGroup {
  group: string;
  types: string[];
}

export interface AppSettings {
  language?: string;
  theme?: 'system' | 'light' | 'dark';
  hotkeys?: {
    closeTab?: string;
    executeAll?: string;
    executeStatement?: string;
    newTab?: string;
  };
}

export interface QueryHistoryEntry {
  id: string;
  sql: string;
  database: string | null;
  serverName: string;
  executedAt: string;
  duration: number;
  rowCount?: number;
  error?: string;
}

export interface IDatabaseDriver {
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  getDatabases(): Promise<DatabaseInfo[]>;
  getTables(database: string): Promise<TableInfo[]>;
  getSchema(database: string): Promise<Record<string, string[]>>;
  getTableColumns(database: string, table: string): Promise<ColumnInfo[]>;
  getTableIndexes(database: string, table: string): Promise<TableIndex[]>;
  getTableForeignKeys(database: string, table: string): Promise<ForeignKey[]>;
  getTableCreateStatement(database: string, table: string): Promise<string>;
  getTableData(database: string, table: string, limit: number, offset: number, sort?: SortConfig[], filter?: string): Promise<TableDataResponse>;
  executeQuery(sql: string): Promise<any>;
  addIndex(database: string, table: string, index: TableIndex): Promise<void>;
  addForeignKey(database: string, table: string, fk: ForeignKey): Promise<void>;
  dropIndex(database: string, table: string, indexName: string): Promise<void>;
  dropForeignKey(database: string, table: string, fkName: string): Promise<void>;
  addColumn(database: string, table: string, column: ColumnInfo, afterColumn?: string): Promise<void>;
  updateColumn(database: string, table: string, oldColumnName: string, newColumn: ColumnInfo, afterColumn?: string): Promise<void>;
  getSupportedTypes(): Promise<TypeGroup[]>;
}
