import type {
  ServerInfo, StoredServer, DatabaseInfo, TableInfo, ColumnInfo, TableIndex, ForeignKey,
  TableDataResponse, SortConfig, AppState, AppSettings, TypeGroup, ServerCapabilities,
  ServerVariablesResult, QueryHistoryEntry, QuerySnippet, QueryResult, SchemaChanges, RowEdit,
} from '@shared/types/database';
import type { FileFilter } from 'electron';

interface ElectronAPI {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, callback: (...args: unknown[]) => void): () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

const electronAPI = window.electronAPI as ElectronAPI;

if (!electronAPI) {
  console.warn('Electron API not found. If you are running in a browser, IPC calls will fail.');
}

// Deep clean objects to remove Vue Proxies and ensure clonability for Electron IPC
const clean = <T>(obj: T): T | undefined => obj !== undefined ? JSON.parse(JSON.stringify(obj)) : undefined;

export const api = {
  getServers: (): Promise<ServerInfo[]> => electronAPI.invoke('api:getServers') as Promise<ServerInfo[]>,
  getDatabases: (serverName: string): Promise<DatabaseInfo[]> => electronAPI.invoke('api:getDatabases', serverName) as Promise<DatabaseInfo[]>,
  refreshServerTree: (serverName: string): Promise<DatabaseInfo[]> => electronAPI.invoke('api:refreshServerTree', serverName) as Promise<DatabaseInfo[]>,
  getTables: (serverName: string, dbName: string): Promise<TableInfo[]> => electronAPI.invoke('api:getTables', serverName, dbName) as Promise<TableInfo[]>,
  getColumns: (serverName: string, dbName: string, tableName: string): Promise<ColumnInfo[]> => electronAPI.invoke('api:getTableColumns', serverName, dbName, tableName) as Promise<ColumnInfo[]>,
  connect: (storedServer: StoredServer): Promise<ServerInfo> => electronAPI.invoke('api:connect', clean(storedServer)) as Promise<ServerInfo>,
  getStoredServers: (): Promise<StoredServer[]> => electronAPI.invoke('api:getStoredServers') as Promise<StoredServer[]>,
  saveStoredServer: (server: StoredServer): Promise<StoredServer> => electronAPI.invoke('api:saveStoredServer', clean(server)) as Promise<StoredServer>,
  updateStoredServer: (name: string, server: StoredServer): Promise<StoredServer> => electronAPI.invoke('api:updateStoredServer', name, clean(server)) as Promise<StoredServer>,
  getAppState: (): Promise<AppState | null> => electronAPI.invoke('api:getAppState') as Promise<AppState | null>,
  saveAppState: (state: AppState): Promise<void> => electronAPI.invoke('api:saveAppState', clean(state)) as Promise<void>,
  getAppSettings: (): Promise<AppSettings> => electronAPI.invoke('api:getAppSettings') as Promise<AppSettings>,
  saveAppSettings: (settings: AppSettings): Promise<void> => electronAPI.invoke('api:saveAppSettings', clean(settings)) as Promise<void>,
  disconnectServer: (name: string): Promise<void> => electronAPI.invoke('api:disconnectServer', name) as Promise<void>,
  getTableData: (serverName: string, dbName: string, tableName: string, options: { limit: number; offset: number; sort?: SortConfig[]; filter?: string }): Promise<TableDataResponse> =>
    electronAPI.invoke('api:getTableData', serverName, dbName, tableName, clean(options)) as Promise<TableDataResponse>,
  getTableIndexes: (serverName: string, dbName: string, tableName: string): Promise<TableIndex[]> => electronAPI.invoke('api:getTableIndexes', serverName, dbName, tableName) as Promise<TableIndex[]>,
  addIndex: (serverName: string, dbName: string, tableName: string, index: TableIndex): Promise<void> => electronAPI.invoke('api:addIndex', serverName, dbName, tableName, clean(index)) as Promise<void>,
  dropIndex: (serverName: string, dbName: string, tableName: string, indexName: string): Promise<void> => electronAPI.invoke('api:dropIndex', serverName, dbName, tableName, indexName) as Promise<void>,
  getTableForeignKeys: (serverName: string, dbName: string, tableName: string): Promise<ForeignKey[]> => electronAPI.invoke('api:getTableForeignKeys', serverName, dbName, tableName) as Promise<ForeignKey[]>,
  addForeignKey: (serverName: string, dbName: string, tableName: string, fk: ForeignKey): Promise<void> => electronAPI.invoke('api:addForeignKey', serverName, dbName, tableName, clean(fk)) as Promise<void>,
  dropForeignKey: (serverName: string, dbName: string, tableName: string, fkName: string): Promise<void> => electronAPI.invoke('api:dropForeignKey', serverName, dbName, tableName, fkName) as Promise<void>,
  addColumn: (serverName: string, dbName: string, tableName: string, column: ColumnInfo, afterColumn?: string): Promise<void> => electronAPI.invoke('api:addColumn', serverName, dbName, tableName, clean(column), afterColumn) as Promise<void>,
  updateColumn: (serverName: string, dbName: string, tableName: string, oldName: string, column: ColumnInfo, afterColumn?: string): Promise<void> => electronAPI.invoke('api:updateColumn', serverName, dbName, tableName, oldName, clean(column), afterColumn) as Promise<void>,
  applySchemaChanges: (serverName: string, dbName: string, tableName: string, changes: SchemaChanges): Promise<void> =>
    electronAPI.invoke('api:applySchemaChanges', serverName, dbName, tableName, clean(changes)) as Promise<void>,
  previewSchemaChanges: (serverName: string, dbName: string, tableName: string, changes: SchemaChanges): Promise<string[]> =>
    electronAPI.invoke('api:previewSchemaChanges', serverName, dbName, tableName, clean(changes)) as Promise<string[]>,
  getTableCreateStatement: (serverName: string, dbName: string, tableName: string): Promise<{ statement: string }> => electronAPI.invoke('api:getTableCreateStatement', serverName, dbName, tableName) as Promise<{ statement: string }>,
  executeSql: (serverName: string, sql: string, database: string): Promise<QueryResult> => electronAPI.invoke('api:executeSql', serverName, sql, database) as Promise<QueryResult>,
  importRows: (serverName: string, dbName: string, tableName: string, columns: string[], rows: (string | null)[][]): Promise<number> =>
    electronAPI.invoke('api:importRows', serverName, dbName, tableName, clean(columns), clean(rows)) as Promise<number>,
  applyRowEdit: (serverName: string, dbName: string, tableName: string, edit: RowEdit): Promise<void> =>
    electronAPI.invoke('api:applyRowEdit', serverName, dbName, tableName, clean(edit)) as Promise<void>,
  previewRowEdit: (serverName: string, dbName: string, tableName: string, edit: RowEdit): Promise<string> =>
    electronAPI.invoke('api:previewRowEdit', serverName, dbName, tableName, clean(edit)) as Promise<string>,
  getSupportedTypes: (serverName: string): Promise<TypeGroup[]> => electronAPI.invoke('api:getSupportedTypes', serverName) as Promise<TypeGroup[]>,
  getSchema: (serverName: string, dbName: string): Promise<Record<string, string[]>> => electronAPI.invoke('api:getSchema', serverName, dbName) as Promise<Record<string, string[]>>,
  getQueryHistory: (): Promise<QueryHistoryEntry[]> => electronAPI.invoke('api:getQueryHistory') as Promise<QueryHistoryEntry[]>,
  addQueryHistory: (entry: QueryHistoryEntry): Promise<void> => electronAPI.invoke('api:addQueryHistory', clean(entry)) as Promise<void>,
  clearQueryHistory: (): Promise<void> => electronAPI.invoke('api:clearQueryHistory') as Promise<void>,
  getProcessList: (serverName: string): Promise<Record<string, unknown>[]> => electronAPI.invoke('api:getProcessList', serverName) as Promise<Record<string, unknown>[]>,
  killProcess: (serverName: string, processId: number | string): Promise<void> => electronAPI.invoke('api:killProcess', serverName, processId) as Promise<void>,
  saveExportFile: (defaultFilename: string, content: string, filters: FileFilter[]): Promise<{ saved: boolean; filePath?: string }> =>
    electronAPI.invoke('api:saveExportFile', defaultFilename, content, clean(filters)) as Promise<{ saved: boolean; filePath?: string }>,
  exportTableData: (serverName: string, dbName: string, tableName: string, format: string, filter: string, sort: SortConfig[]): Promise<{ saved: boolean; filePath?: string }> =>
    electronAPI.invoke('api:exportTableData', serverName, dbName, tableName, format, filter, clean(sort)) as Promise<{ saved: boolean; filePath?: string }>,
  tableMaintenanceOp: (serverName: string, dbName: string, tableName: string, op: string): Promise<QueryResult> => electronAPI.invoke('api:tableMaintenanceOp', serverName, dbName, tableName, op) as Promise<QueryResult>,
  getServerVariables: (serverName: string): Promise<ServerVariablesResult> => electronAPI.invoke('api:getServerVariables', serverName) as Promise<ServerVariablesResult>,
  getServerCapabilities: (serverName: string): Promise<ServerCapabilities> => electronAPI.invoke('api:getServerCapabilities', serverName) as Promise<ServerCapabilities>,
  openFileDialog: (filters: FileFilter[]): Promise<{ filePath: string; content: string } | null> => electronAPI.invoke('api:openFileDialog', clean(filters)) as Promise<{ filePath: string; content: string } | null>,
  getSnippets: (): Promise<QuerySnippet[]> => electronAPI.invoke('api:getSnippets') as Promise<QuerySnippet[]>,
  saveSnippet: (snippet: QuerySnippet): Promise<void> => electronAPI.invoke('api:saveSnippet', clean(snippet)) as Promise<void>,
  deleteSnippet: (id: string): Promise<void> => electronAPI.invoke('api:deleteSnippet', id) as Promise<void>,
};
