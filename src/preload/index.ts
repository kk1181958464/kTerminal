import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { Api } from '../shared/types'

function listen<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as T))
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: Api = {
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    save: (input) => ipcRenderer.invoke('sessions:save', input),
    remove: (id) => ipcRenderer.invoke('sessions:delete', id)
  },
  ssh: {
    connect: (tabId, sessionId, cols, rows, secret) =>
      ipcRenderer.invoke('ssh:connect', tabId, sessionId, cols, rows, secret),
    write: (tabId, data) => ipcRenderer.send('ssh:write', tabId, data),
    resize: (tabId, cols, rows) => ipcRenderer.send('ssh:resize', tabId, cols, rows),
    close: (tabId) => ipcRenderer.send('ssh:close', tabId),
    onData: (cb) => listen('ssh:data', cb),
    onClosed: (cb) => listen('ssh:closed', cb)
  },
  dialog: {
    openPrivateKey: () => ipcRenderer.invoke('dialog:openPrivateKey')
  },
  local: {
    home: () => ipcRenderer.invoke('local:home'),
    places: () => ipcRenderer.invoke('local:places'),
    list: (dir) => ipcRenderer.invoke('local:list', dir),
    mkdir: (dir, name) => ipcRenderer.invoke('local:mkdir', dir, name),
    rename: (dir, from, to) => ipcRenderer.invoke('local:rename', dir, from, to),
    remove: (paths) => ipcRenderer.invoke('local:remove', paths),
    open: (path) => ipcRenderer.invoke('local:open', path),
    showInFolder: (path) => ipcRenderer.send('local:showInFolder', path)
  },
  sftp: {
    home: (tabId) => ipcRenderer.invoke('sftp:home', tabId),
    list: (tabId, dir) => ipcRenderer.invoke('sftp:list', tabId, dir),
    mkdir: (tabId, dir, name) => ipcRenderer.invoke('sftp:mkdir', tabId, dir, name),
    rename: (tabId, dir, from, to) => ipcRenderer.invoke('sftp:rename', tabId, dir, from, to),
    remove: (tabId, entries) => ipcRenderer.invoke('sftp:remove', tabId, entries)
  },
  transfer: {
    start: (req) => ipcRenderer.invoke('transfer:start', req),
    cancel: (id) => ipcRenderer.send('transfer:cancel', id),
    retry: (id) => ipcRenderer.send('transfer:retry', id),
    clear: () => ipcRenderer.invoke('transfer:clear'),
    onUpdate: (cb) => listen('transfer:update', cb)
  },
  edit: {
    open: (tabId, remotePath) => ipcRenderer.invoke('edit:open', tabId, remotePath),
    getEditor: () => ipcRenderer.invoke('edit:getEditor'),
    chooseEditor: () => ipcRenderer.invoke('edit:chooseEditor'),
    resetEditor: () => ipcRenderer.invoke('edit:resetEditor'),
    release: (tabId) => ipcRenderer.send('edit:release', tabId),
    onSynced: (cb) => listen('edit:synced', cb)
  },
  window: {
    setTheme: (background, symbol) => ipcRenderer.send('window:setTheme', background, symbol),
    getCloseToTray: () => ipcRenderer.invoke('window:getCloseToTray'),
    setCloseToTray: (value) => ipcRenderer.send('window:setCloseToTray', value)
  },
  fonts: {
    list: () => ipcRenderer.invoke('fonts:list'),
    import: () => ipcRenderer.invoke('fonts:import'),
    read: (id) => ipcRenderer.invoke('fonts:read', id),
    remove: (id) => ipcRenderer.invoke('fonts:remove', id)
  },
  appVersion: () => ipcRenderer.invoke('app:version'),
  getPathForFile: (file) => webUtils.getPathForFile(file)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
