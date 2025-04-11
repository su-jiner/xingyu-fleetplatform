const { contextBridge, ipcRenderer } = require('electron');

// 定义公开的 API
contextBridge.exposeInMainWorld('electronAPI', {
  closeApp: () => ipcRenderer.send('close-app'),
  openLoggerWindow: () => ipcRenderer.send('open-logger-window'),
  closeLoggerWindow: () => ipcRenderer.send('close-logger-window'),
  closeUpdateWindow: () => ipcRenderer.send('close-update-window'),
  deleteFiles: (fileName) => ipcRenderer.send('delete-files', fileName),
  receive: (channel, callback) => {
    // 过滤合法的 channel
    const validChannels = ['delete-files-reply']; // 添加其他合法的 channel
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  startDownload: (url) => ipcRenderer.send('start-download', url),
  disableInteraction: (disable) => ipcRenderer.send('disable-interaction', disable),
  setJwtToken: (token) => ipcRenderer.send('set-jwt-token', token),
  loadSettings: () => ipcRenderer.invoke('get-settings'),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args) // 确保 invoke 方法被暴露
});

// 如果需要额外的命名空间，可以这样暴露
contextBridge.exposeInMainWorld('electron', {
  send: (channel, data) => {
    // 白名单通道
    let validChannels = ['download-and-unzip', 'disable-interaction', 'set-jwt-token'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    // 白名单通道
    let validChannels = ['download-and-unzip-reply', 'disable-ui'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  }
});