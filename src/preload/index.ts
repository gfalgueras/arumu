import { contextBridge, ipcRenderer } from 'electron';

const ALLOWED_INVOKE_CHANNELS = new Set([
  'log:error',
  'api:getServers',
  'api:getDatabases',
  'api:getTables',
  'api:getSchema',
  'api:connect',
  'api:disconnectServer',
  'api:getStoredServers',
  'api:saveStoredServer',
  'api:updateStoredServer',
  'api:getAppState',
  'api:saveAppState',
  'api:getAppSettings',
  'api:saveAppSettings',
  'api:getTableData',
  'api:getTableColumns',
  'api:getTableIndexes',
  'api:addIndex',
  'api:dropIndex',
  'api:getTableForeignKeys',
  'api:addForeignKey',
  'api:dropForeignKey',
  'api:addColumn',
  'api:updateColumn',
  'api:getTableCreateStatement',
  'api:executeSql',
  'api:getSupportedTypes',
  'api:getQueryHistory',
  'api:addQueryHistory',
  'api:clearQueryHistory',
  'api:getProcessList',
  'api:killProcess',
  'api:saveExportFile',
  'api:exportTableData',
  'api:tableMaintenanceOp',
  'api:getServerVariables',
  'api:getServerCapabilities',
  'api:openFileDialog',
  'api:getSnippets',
  'api:saveSnippet',
  'api:deleteSnippet',
]);

const ALLOWED_ON_CHANNELS = new Set([
  'app:notification',
  'query:log',
]);

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: any[]) => {
    if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel: string, callback: (...args: any[]) => void) => {
    if (!ALLOWED_ON_CHANNELS.has(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`);
    }
    const subscription = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  }
});
