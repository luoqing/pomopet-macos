const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pomopet', {
  command: (name, payload) => ipcRenderer.invoke('command', name, payload),
  getState: () => ipcRenderer.invoke('state'),
  showControl: () => ipcRenderer.invoke('show-control'),
  hidePet: () => ipcRenderer.invoke('hide-pet'),
  dragPet: (delta) => ipcRenderer.send('drag-pet', delta),
  onState: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('state', handler);
    return () => ipcRenderer.removeListener('state', handler);
  },
  onPresentation: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('presentation', handler);
    return () => ipcRenderer.removeListener('presentation', handler);
  }
});
