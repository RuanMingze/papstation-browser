/**
 * Flowmora Browser - Preload Script
 * 
 * This script runs in a context with access to both the renderer process
 * and a limited subset of Node.js APIs. It serves as a secure bridge
 * between the main process and the renderer.
 * 
 * Security settings:
 * - contextIsolation: true (this script runs in isolated context)
 * - nodeIntegration: false (renderer has no direct Node.js access)
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
// These APIs are available in the renderer via window.focusFlowAPI
contextBridge.exposeInMainWorld('focusFlowAPI', {
    // Platform information
    platform: process.platform,

    // Version information
    versions: {
        node: process.versions.node,
        chrome: process.versions.chrome,
        electron: process.versions.electron,
    },

    // ============================================
    // Download Manager APIs
    // ============================================
    downloads: {
        pause: (downloadId) => ipcRenderer.invoke('pause-download', downloadId),
        resume: (downloadId) => ipcRenderer.invoke('resume-download', downloadId),
        cancel: (downloadId) => ipcRenderer.invoke('cancel-download', downloadId),
        open: (savePath) => ipcRenderer.invoke('open-download', savePath),
        showInFolder: (savePath) => ipcRenderer.invoke('show-download-folder', savePath),
        getAll: () => ipcRenderer.invoke('get-downloads'),
        clearCompleted: () => ipcRenderer.invoke('clear-completed-downloads'),

        // Event listeners for download updates
        onStarted: (callback) => {
            ipcRenderer.on('download-started', (event, data) => callback(data));
        },
        onProgress: (callback) => {
            ipcRenderer.on('download-progress', (event, data) => callback(data));
        },
        onCompleted: (callback) => {
            ipcRenderer.on('download-completed', (event, data) => callback(data));
        }
    },

    // ============================================
    // General IPC Methods
    // ============================================
    sendMessage: (channel, data) => {
        const validChannels = ['navigate', 'new-tab', 'close-tab'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },

    onMessage: (channel, callback) => {
        const validChannels = ['navigation-update', 'tab-update', 'fullscreen-changed'];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    },

    invoke: async (channel, data) => {
        const validChannels = ['get-history', 'get-bookmarks'];
        if (validChannels.includes(channel)) {
            return await ipcRenderer.invoke(channel, data);
        }
        return null;
    },

    // ============================================
    // Incognito Mode API
    // ============================================
    incognito: {
        openWindow: () => ipcRenderer.invoke('open-incognito-window')
    },

    // ============================================
    // Window Control API
    // ============================================
    window: {
        minimize: () => ipcRenderer.invoke('window-minimize'),
        maximize: () => ipcRenderer.invoke('window-maximize'),
        close: () => ipcRenderer.invoke('window-close'),
        toggleFullScreen: () => ipcRenderer.invoke('window-toggle-fullscreen')
    },

    // ============================================
    // Webview Control API
    // ============================================
    webview: {
        goBack: (webviewId) => ipcRenderer.invoke('webview-go-back', webviewId),
        goForward: (webviewId) => ipcRenderer.invoke('webview-go-forward', webviewId),
        savePage: (webviewId) => ipcRenderer.invoke('webview-save-page', webviewId),
        openDevTools: (webviewId) => ipcRenderer.invoke('webview-open-devtools', webviewId),
        capturePage: (webviewId) => ipcRenderer.invoke('webview-capture-page', webviewId)
    },

    // ============================================
    // File System API
    // ============================================
    file: {
        saveImage: (dataUrl, filename) => {
            console.log('[DEBUG preload] saveImage called with dataUrl length:', dataUrl ? dataUrl.length : 0, 'filename:', filename);
            console.log('[DEBUG preload] Preparing to invoke file-save-image');
            const payload = { dataUrl, filename };
            console.log('[DEBUG preload] Payload type:', typeof payload, 'keys:', Object.keys(payload));
            console.log('[DEBUG preload] Payload dataUrl type:', typeof payload.dataUrl);
            console.log('[DEBUG preload] Payload filename type:', typeof payload.filename);
            return ipcRenderer.invoke('file-save-image', payload);
        }
    },

    // ============================================
    // Password Manager API
    // ============================================
    passwordManager: {
        savePassword: (data) => ipcRenderer.invoke('password-save', data),
        getPasswords: () => ipcRenderer.invoke('password-get-all'),
        deletePassword: (id) => ipcRenderer.invoke('password-delete', id),
        verifyWithHello: () => ipcRenderer.invoke('password-verify-hello')
    }
});
