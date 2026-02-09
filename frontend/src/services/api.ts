const electronAPI = (window as any).electronAPI;

if (!electronAPI) {
  console.warn('Electron API not found. If you are running in a browser, IPC calls will fail.');
}

export const api = {
  getServers: () => electronAPI.invoke('api:getServers'),
  getDatabases: (serverName: string) => electronAPI.invoke('api:getDatabases', serverName),
  getTables: (serverName: string, dbName: string) => electronAPI.invoke('api:getTables', serverName, dbName),
  getColumns: (serverName: string, dbName: string, tableName: string) => electronAPI.invoke('api:getTableColumns', serverName, dbName, tableName),
  connect: (storedServer: any) => electronAPI.invoke('api:connect', storedServer),
  getStoredServers: () => electronAPI.invoke('api:getStoredServers'),
  saveStoredServer: (server: any) => electronAPI.invoke('api:saveStoredServer', server),
  updateStoredServer: (name: string, server: any) => electronAPI.invoke('api:updateStoredServer', name, server),
  getAppState: () => electronAPI.invoke('api:getAppState'),
  saveAppState: (state: any) => electronAPI.invoke('api:saveAppState', state),
  getAppSettings: () => electronAPI.invoke('api:getAppSettings'),
  saveAppSettings: (settings: any) => electronAPI.invoke('api:saveAppSettings', settings),
  disconnectServer: (name: string) => electronAPI.invoke('api:disconnectServer', name),
  getTableData: (serverName: string, dbName: string, tableName: string, options: any) => electronAPI.invoke('api:getTableData', serverName, dbName, tableName, options),
  getTableIndexes: (serverName: string, dbName: string, tableName: string) => electronAPI.invoke('api:getTableIndexes', serverName, dbName, tableName),
  addIndex: (serverName: string, dbName: string, tableName: string, index: any) => electronAPI.invoke('api:addIndex', serverName, dbName, tableName, index),
  dropIndex: (serverName: string, dbName: string, tableName: string, indexName: string) => electronAPI.invoke('api:dropIndex', serverName, dbName, tableName, indexName),
  getTableForeignKeys: (serverName: string, dbName: string, tableName: string) => electronAPI.invoke('api:getTableForeignKeys', serverName, dbName, tableName),
  addForeignKey: (serverName: string, dbName: string, tableName: string, fk: any) => electronAPI.invoke('api:addForeignKey', serverName, dbName, tableName, fk),
  dropForeignKey: (serverName: string, dbName: string, tableName: string, fkName: string) => electronAPI.invoke('api:dropForeignKey', serverName, dbName, tableName, fkName),
  addColumn: (serverName: string, dbName: string, tableName: string, column: any, afterColumn: any) => electronAPI.invoke('api:addColumn', serverName, dbName, tableName, column, afterColumn),
  updateColumn: (serverName: string, dbName: string, tableName: string, oldName: string, column: any, afterColumn: any) => electronAPI.invoke('api:updateColumn', serverName, dbName, tableName, oldName, column, afterColumn),
  getTableCreateStatement: (serverName: string, dbName: string, tableName: string) => electronAPI.invoke('api:getTableCreateStatement', serverName, dbName, tableName),
  executeSql: (serverName: string, sql: string, database: string) => electronAPI.invoke('api:executeSql', serverName, sql, database),
  getSupportedTypes: (serverName: string) => electronAPI.invoke('api:getSupportedTypes', serverName),
  getSchema: (serverName: string, dbName: string) => electronAPI.invoke('api:getSchema', serverName, dbName),
};
