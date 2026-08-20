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
  type: 'mysql' | 'postgres' | 'sqlite' | 'sqlserver' | 'oracle';
  databases?: DatabaseInfo[];
  config?: ConnectionConfig;
}

export interface StoredServer {
  name: string;
  type: 'mysql' | 'postgres' | 'sqlite' | 'sqlserver' | 'oracle';
  config: ConnectionConfig;
}

export interface ConnectionConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database?: string;
  defaultFilter?: string; // Comma separated list of databases to hide
  filePath?: string; // SQLite: path to .db file
}

export interface TableDataResponse {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
}

export interface SortConfig {
  column: string;
  direction: 'ASC' | 'DESC';
}

export interface AppState {
  activeServerNames: string[];
  selectedServerName: string | null;
  // Not currently saved/restored by App.vue — table/database selection doesn't
  // survive a restart. Kept optional rather than wired up, since restoring it
  // is a product decision, not a type-cleanup one.
  selectedDatabase?: string | null;
  selectedTable?: string | null;
  activeTab: string;
  queryTabs: { id: string; name: string; query: string }[];
  sidebarWidth: number;
  queryEditorHeight?: number;
  tableSchemaHeight?: number;
  dbFilter: string;
  tableFilter: string;
  expandedServerNames: string[];
  expandedDatabaseIds: string[]; // Formato "serverName:dbName"
  expandedTableIds?: string[]; // Formato "serverName:dbName:tableName"
}

export interface TypeGroup {
  group: string;
  types: string[];
}

export interface ServerCapabilities {
  supportsUnsigned: boolean;
  supportsVirtuality: boolean;
  supportsCollation: boolean;
  supportsColumnComment: boolean;
  supportsFullTextIndex: boolean;
  supportsSpatialIndex: boolean;
  supportsProcessList: boolean;
  supportsServerVariables: boolean;
  supportsTableMaintenance: boolean;
  maintenanceOps: string[];
  indexTypes: string[];
  processIdField: string;
}

export interface VariableRow {
  name: string;
  value: string;
}

export interface ServerVariablesResult {
  variables: VariableRow[];
  status: VariableRow[];
}

export interface AppSettings {
  language?: string;
  theme?: 'system' | 'light' | 'dark';
  menuDensity?: 'standard' | 'compact';
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

export interface QuerySnippet {
  id: string;
  name: string;
  sql: string;
  createdAt: string;
}

// executeQuery/runTableMaintenance return rows for SELECTs, or a result-info
// object (affectedRows, insertId, ...) for INSERT/UPDATE/DELETE/DDL.
export type QueryResult = Record<string, unknown>[] | Record<string, unknown>;

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
  executeQuery(sql: string): Promise<QueryResult>;
  addIndex(database: string, table: string, index: TableIndex): Promise<void>;
  addForeignKey(database: string, table: string, fk: ForeignKey): Promise<void>;
  dropIndex(database: string, table: string, indexName: string): Promise<void>;
  dropForeignKey(database: string, table: string, fkName: string): Promise<void>;
  addColumn(database: string, table: string, column: ColumnInfo, afterColumn?: string): Promise<void>;
  updateColumn(database: string, table: string, oldColumnName: string, newColumn: ColumnInfo, afterColumn?: string): Promise<void>;
  getSupportedTypes(): Promise<TypeGroup[]>;
  getCapabilities(): ServerCapabilities;
  getProcessList(): Promise<Record<string, unknown>[]>;
  killProcess(processId: number | string): Promise<void>;
  getServerVariables(): Promise<ServerVariablesResult>;
  escapeIdentifier(name: string): string;
  escapeStringLiteral(val: string): string;
  runTableMaintenance(database: string, table: string, op: string): Promise<QueryResult>;
}
