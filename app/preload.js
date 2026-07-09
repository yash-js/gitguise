const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gitguise', {
  profiles: {
    getAll: () => ipcRenderer.invoke('profiles:get-all'),
    save: (profile) => ipcRenderer.invoke('profiles:save', profile),
    delete: (id, options) => ipcRenderer.invoke('profiles:delete', id, options),
  },
  store: {
    get: () => ipcRenderer.invoke('store:get'),
    set: (key, value) => ipcRenderer.invoke('store:set', key, value),
    reset: () => ipcRenderer.invoke('store:reset'),
  },
  ssh: {
    checkKeyExists: (sshKeyName) => ipcRenderer.invoke('ssh:check-key-exists', sshKeyName),
    generateKey: (opts) => ipcRenderer.invoke('ssh:generate-key', opts),
    getPublicKey: (sshKeyName) => ipcRenderer.invoke('ssh:get-public-key', sshKeyName),
    testConnection: (opts) => ipcRenderer.invoke('ssh:test-connection', opts),
    writeConfig: (profiles) => ipcRenderer.invoke('ssh:write-config', profiles),
    readConfig: () => ipcRenderer.invoke('ssh:read-config'),
    previewConfig: (profiles) => ipcRenderer.invoke('ssh:preview-config', profiles),
    mergePreview: (profiles) => ipcRenderer.invoke('ssh:merge-preview', profiles),
  },
  hooks: {
    preview: (profiles, settings) => ipcRenderer.invoke('hooks:preview', profiles, settings),
    writeAll: () => ipcRenderer.invoke('hooks:write-all'),
    removeAll: () => ipcRenderer.invoke('hooks:remove-all'),
    getStatus: () => ipcRenderer.invoke('hooks:get-status'),
    regenerate: () => ipcRenderer.invoke('hooks:regenerate'),
  },
  repos: {
    scan: (opts) => ipcRenderer.invoke('repos:scan', opts),
    getInfo: (repoPath) => ipcRenderer.invoke('repos:get-info', repoPath),
    switchProfile: (opts) => ipcRenderer.invoke('repos:switch-profile', opts),
    push: (opts) => ipcRenderer.invoke('repos:push', opts),
  },
  shell: {
    run: (opts) => ipcRenderer.invoke('shell:run', opts),
    onOutput: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on('shell:output', handler);
      return () => ipcRenderer.removeListener('shell:output', handler);
    },
    onExit: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on('shell:exit', handler);
      return () => ipcRenderer.removeListener('shell:exit', handler);
    },
    kill: (streamId) => ipcRenderer.send('shell:kill', streamId),
  },
  system: {
    detectProfiles: () => ipcRenderer.invoke('system:detect-profiles'),
  },
  app: {
    openUrl: (url) => ipcRenderer.invoke('app:open-url', url),
    selectFolder: () => ipcRenderer.invoke('app:select-folder'),
    getPlatform: () => ipcRenderer.invoke('app:get-platform'),
    openInTerminal: (path) => ipcRenderer.invoke('app:open-in-terminal', path),
    openInExplorer: (path) => ipcRenderer.invoke('app:open-in-explorer', path),
    copyToClipboard: (text) => ipcRenderer.invoke('app:copy-to-clipboard', text),
    exportConfig: () => ipcRenderer.invoke('app:export-config'),
    importConfig: () => ipcRenderer.invoke('app:import-config'),
    getVersion: () => ipcRenderer.invoke('app:get-version'),
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
});
