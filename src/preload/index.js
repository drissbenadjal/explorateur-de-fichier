import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  fs: {
    home: () => electronAPI.ipcRenderer.invoke('fs:home'),
    list: (dir) => electronAPI.ipcRenderer.invoke('fs:list', dir),
    readFile: (file) => electronAPI.ipcRenderer.invoke('fs:readFile', file),
    known: () => electronAPI.ipcRenderer.invoke('fs:known'),
    drives: () => electronAPI.ipcRenderer.invoke('fs:drives'),
    refreshDrives: () => electronAPI.ipcRenderer.invoke('fs:drives'),
    open: (p) => electronAPI.ipcRenderer.invoke('fs:open', p),
    icon: (p) => electronAPI.ipcRenderer.invoke('fs:icon', p),
    rename: (oldPath, newName) => electronAPI.ipcRenderer.invoke('fs:rename', oldPath, newName)
  },
  app: {
    stats: () => electronAPI.ipcRenderer.invoke('app:stats'),
    shortcuts: {
      list: () => electronAPI.ipcRenderer.invoke('app:shortcuts:list'),
      add: (item) => electronAPI.ipcRenderer.invoke('app:shortcuts:add', item),
      remove: (id) => electronAPI.ipcRenderer.invoke('app:shortcuts:remove', id)
    },
    onUpdateReady: (cb) => electronAPI.ipcRenderer.on('update:ready', cb),
    installUpdate: () => electronAPI.ipcRenderer.invoke('update:quitAndInstall')
  },
  splash: {
    launchMain: () => electronAPI.ipcRenderer.invoke('splash:launchMain'),
    onStatus: (cb) => electronAPI.ipcRenderer.on('splash:status', (_e, p) => cb(p))
  },
  version: () => electronAPI.ipcRenderer.invoke('app:version'),
  wallet: {
    init: () => electronAPI.ipcRenderer.invoke('wallet:init'),
  balance: (opts) => electronAPI.ipcRenderer.invoke('wallet:balance', opts),
  send: (payload) => electronAPI.ipcRenderer.invoke('wallet:send', payload),
  txStatus: (payload) => electronAPI.ipcRenderer.invoke('wallet:txStatus', payload)
  },
  win: {
    minimize: () => electronAPI.ipcRenderer.invoke('win:minimize'),
    maximize: () => electronAPI.ipcRenderer.invoke('win:maximize'),
    close: () => electronAPI.ipcRenderer.invoke('win:close'),
    onMaximized: (cb) => electronAPI.ipcRenderer.on('win:maximized', (_e, v) => cb(v))
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
