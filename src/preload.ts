import { contextBridge, ipcRenderer } from 'electron';

console.log('preload.js loaded');

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, data: any) => ipcRenderer.invoke(channel, data),
  on: (channel: string, callback: any) => {
    ipcRenderer.on(channel, (event, ...args) => callback(event, ...args))
  },
});

