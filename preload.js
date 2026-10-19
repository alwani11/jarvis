const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  ask: (text) => ipcRenderer.send('ask', text),
  cancel: () => ipcRenderer.send('cancel'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  connect: (name) => ipcRenderer.invoke('connect', name),
  on: (channel, fn) => ipcRenderer.on(channel, (_e, ...a) => fn(...a)),
});
