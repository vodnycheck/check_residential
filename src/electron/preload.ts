import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Account management
    getAccounts: () => ipcRenderer.invoke('get-accounts'),
    saveAccounts: (content: string) => ipcRenderer.invoke('save-accounts', content),

    // Settings management
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),

    // Check operations
    runCheck: () => ipcRenderer.invoke('run-check'),

    // Logs
    getLogs: () => ipcRenderer.invoke('get-logs'),

    // Status updates
    onCheckStatus: (callback: (event: any, data: any) => void) => {
        ipcRenderer.on('check-status', callback);
    },

    // Open data folder
    openDataFolder: () => {
        ipcRenderer.invoke('open-data-folder');
    },

    // Open logs folder
    openLogsFolder: () => {
        ipcRenderer.invoke('open-logs-folder');
    }
});