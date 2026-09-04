const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pomopet', {
  command: (name, payload) => ipcRenderer.invoke('command', name, payload),
  setAiKey: (key) => ipcRenderer.invoke('ai:set-key', key),
  setDirty: (dirty) => ipcRenderer.send('window:set-dirty', Boolean(dirty)),
  getState: () => ipcRenderer.invoke('state'),
  synthesizeSpeech: (payload) => ipcRenderer.invoke('speech:synthesize', payload),
  showControl: (payload) => ipcRenderer.invoke('show-control', payload),
  hideBlocker: () => ipcRenderer.invoke('hide-blocker'),
  hidePet: () => ipcRenderer.invoke('hide-pet'),
  setPetSpeaking: (payload) => ipcRenderer.invoke('pet:set-speaking', payload),
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
  },
  onControlFocus: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('control-focus', handler);
    return () => ipcRenderer.removeListener('control-focus', handler);
  },
  onDiscardDrafts: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('discard-drafts', handler);
    return () => ipcRenderer.removeListener('discard-drafts', handler);
  }
});
