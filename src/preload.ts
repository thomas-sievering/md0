import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { DocumentApi } from './shared/document';

const api: DocumentApi = {
  openExternal: url => ipcRenderer.invoke('document:openExternal', url),
  state: () => ipcRenderer.invoke('document:state'),
  open: () => ipcRenderer.invoke('document:open'),
  recent: () => ipcRenderer.invoke('document:recent'),
  openRecent: path => ipcRenderer.invoke('document:openRecent', path),
  openDroppedFile: file => ipcRenderer.invoke('document:openDropped', webUtils.getPathForFile(file)),
  newDocument: () => ipcRenderer.invoke('document:newDocument'),
  edit: text => ipcRenderer.invoke('document:edit', text),
  save: () => ipcRenderer.invoke('document:save'),
  refresh: () => ipcRenderer.invoke('document:refresh'),
  loadDiskVersion: () => ipcRenderer.invoke('document:loadDiskVersion'),
  saveCopy: () => ipcRenderer.invoke('document:saveCopy'),
  restoreBackup: () => ipcRenderer.invoke('document:restoreBackup'),
  close: () => ipcRenderer.invoke('document:close'),
  zen: enable => ipcRenderer.invoke('document:zen', enable),
  onCloseRequested: listener => { ipcRenderer.on('document:close-requested', () => listener()); },
  onWindowBlurred: listener => { ipcRenderer.on('document:window-blurred', () => listener()); },
  onOpenError: listener => { ipcRenderer.on('document:open-error', (_event, message: string) => listener(message)); },
};
contextBridge.exposeInMainWorld('documentApi', api);
