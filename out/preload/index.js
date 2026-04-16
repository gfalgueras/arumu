"use strict";
const electron = require("electron");
const ALLOWED_INVOKE_CHANNELS = /* @__PURE__ */ new Set([
  "api:getServers",
  "api:getDatabases",
  "api:getTables",
  "api:getSchema",
  "api:connect",
  "api:disconnectServer",
  "api:getStoredServers",
  "api:saveStoredServer",
  "api:updateStoredServer",
  "api:getAppState",
  "api:saveAppState",
  "api:getAppSettings",
  "api:saveAppSettings",
  "api:getTableData",
  "api:getTableColumns",
  "api:getTableIndexes",
  "api:addIndex",
  "api:dropIndex",
  "api:getTableForeignKeys",
  "api:addForeignKey",
  "api:dropForeignKey",
  "api:addColumn",
  "api:updateColumn",
  "api:getTableCreateStatement",
  "api:executeSql",
  "api:getSupportedTypes"
]);
const ALLOWED_ON_CHANNELS = /* @__PURE__ */ new Set([
  "app:notification"
]);
electron.contextBridge.exposeInMainWorld("electronAPI", {
  invoke: (channel, ...args) => {
    if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`);
    }
    return electron.ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, callback) => {
    if (!ALLOWED_ON_CHANNELS.has(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`);
    }
    const subscription = (_event, ...args) => callback(...args);
    electron.ipcRenderer.on(channel, subscription);
    return () => electron.ipcRenderer.removeListener(channel, subscription);
  }
});
