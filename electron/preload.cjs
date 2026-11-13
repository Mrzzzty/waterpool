const { contextBridge } = require('electron')

// The renderer only needs to know it is running inside the desktop shell.
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  electron: process.versions.electron,
})
