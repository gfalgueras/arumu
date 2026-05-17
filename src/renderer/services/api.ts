const electronAPI = (window as any).electronAPI;

if (!electronAPI) {
  console.warn('Electron API not found. If you are running in a browser, IPC calls will fail.');
}

// Deep clean objects to remove Vue Proxies and ensure clonability for Electron IPC
const clean = (obj: any) => obj !== undefined ? JSON.parse(JSON.stringify(obj)) : undefined;

export const api = {
  getServers: () => electronAPI.invoke('api:getServers'),
  getDatabases: (serverName: string) => electronAPI.invoke('api:getDatabases', serverName),
  getTables: (serverName: string, dbName: string) => electronAPI.invoke('api:getTables', serverName, dbName),
  getColumns: (serverName: string, dbName: string, tableName: string) => electronAPI.invoke('api:getTableColumns', serverName, dbName, tableName),
  connect: (storedServer: any) => electronAPI.invoke('api:connect', clean(storedServer)),
  getStoredServers: () => electronAPI.invoke('api:getStoredServers'),
  saveStoredServer: (server: any) => electronAPI.invoke('api:saveStoredServer', clean(server)),
  updateStoredServer: (name: string, server: any) => electronAPI.invoke('api:updateStoredServer', name, clean(server)),
  getAppState: () => electronAPI.invoke('api:getAppState'),
  saveAppState: (state: any) => electronAPI.invoke('api:saveAppState', clean(state)),
  getAppSettings: () => electronAPI.invoke('api:getAppSettings'),
  saveAppSettings: (settings: any) => electronAPI.invoke('api:saveAppSettings', clean(settings)),
  disconnectServer: (name: string) => electronAPI.invoke('api:disconnectServer', name),
  getTableData: (serverName: string, dbName: string, tableName: string, options: any) => electronAPI.invoke('api:getTableData', serverName, dbName, tableName, clean(options)),
  getTableIndexes: (serverName: string, dbName: string, tableName: string) => electronAPI.invoke('api:getTableIndexes', serverName, dbName, tableName),
  addIndex: (serverName: string, dbName: string, tableName: string, index: any) => electronAPI.invoke('api:addIndex', serverName, dbName, tableName, clean(index)),
  dropIndex: (serverName: string, dbName: string, tableName: string, indexName: string) => electronAPI.invoke('api:dropIndex', serverName, dbName, tableName, indexName),
  getTableForeignKeys: (serverName: string, dbName: string, tableName: string) => electronAPI.invoke('api:getTableForeignKeys', serverName, dbName, tableName),
  addForeignKey: (serverName: string, dbName: string, tableName: string, fk: any) => electronAPI.invoke('api:addForeignKey', serverName, dbName, tableName, clean(fk)),
  dropForeignKey: (serverName: string, dbName: string, tableName: string, fkName: string) => electronAPI.invoke('api:dropForeignKey', serverName, dbName, tableName, fkName),
  addColumn: (serverName: string, dbName: string, tableName: string, column: any, afterColumn: any) => electronAPI.invoke('api:addColumn', serverName, dbName, tableName, clean(column), afterColumn),
  updateColumn: (serverName: string, dbName: string, tableName: string, oldName: string, column: any, afterColumn: any) => electronAPI.invoke('api:updateColumn', serverName, dbName, tableName, oldName, clean(column), afterColumn),
  getTableCreateStatement: (serverName: string, dbName: string, tableName: string) => electronAPI.invoke('api:getTableCreateStatement', serverName, dbName, tableName),
  executeSql: (serverName: string, sql: string, database: string) => electronAPI.invoke('api:executeSql', serverName, sql, database),
  getSupportedTypes: (serverName: string) => electronAPI.invoke('api:getSupportedTypes', serverName),
  getSchema: (serverName: string, dbName: string) => electronAPI.invoke('api:getSchema', serverName, dbName),
  getQueryHistory: () => electronAPI.invoke('api:getQueryHistory'),
  addQueryHistory: (entry: any) => electronAPI.invoke('api:addQueryHistory', clean(entry)),
  clearQueryHistory: () => electronAPI.invoke('api:clearQueryHistory'),
  getProcessList: (serverName: string) => electronAPI.invoke('api:getProcessList', serverName),
  killProcess: (serverName: string, processId: number) => electronAPI.invoke('api:killProcess', serverName, processId),
  saveExportFile: (defaultFilename: string, content: string, filters: any[]) => electronAPI.invoke('api:saveExportFile', defaultFilename, content, clean(filters)),
  exportTableData: (serverName: string, dbName: string, tableName: string, format: string, filter: string, sort: any[]) => electronAPI.invoke('api:exportTableData', serverName, dbName, tableName, format, filter, clean(sort)),
  tableMaintenanceOp: (serverName: string, dbName: string, tableName: string, op: string) => electronAPI.invoke('api:tableMaintenanceOp', serverName, dbName, tableName, op),
  getServerVariables: (serverName: string) => electronAPI.invoke('api:getServerVariables', serverName),
  getServerCapabilities: (serverName: string) => electronAPI.invoke('api:getServerCapabilities', serverName),
  openFileDialog: (filters: any[]) => electronAPI.invoke('api:openFileDialog', clean(filters)),
  getSnippets: () => electronAPI.invoke('api:getSnippets'),
  saveSnippet: (snippet: any) => electronAPI.invoke('api:saveSnippet', clean(snippet)),
  deleteSnippet: (id: string) => electronAPI.invoke('api:deleteSnippet', id),
};
