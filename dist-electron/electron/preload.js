"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    invoke: (channel, ...args) => electron_1.ipcRenderer.invoke(channel, ...args),
    on: (channel, callback) => {
        const subscription = (_event, ...args) => callback(...args);
        electron_1.ipcRenderer.on(channel, subscription);
        return () => electron_1.ipcRenderer.removeListener(channel, subscription);
    }
});
