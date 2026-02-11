const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('path');
const { default: contextMenu } = require('electron-context-menu');

// Disable WebViewAllowPopupsWarning to allow popups
app.commandLine.appendSwitch('disable-features', 'WebViewAllowPopupsWarning');

if (require('electron-squirrel-startup')) app.quit();

// Determine if we're in development mode
const isDev = process.env.NODE_ENV === 'development';

// Store for managing downloads
let mainWindow = null;
const downloads = new Map();

function createWindow() {
    // Create the browser window with secure settings
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'PaperStation',
        icon: path.join(__dirname, 'assets/icon.png'),
        frame: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,      // Security: isolate context
            nodeIntegration: false,      // Security: disable node in renderer
            webviewTag: true,            // Enable webview for browser tabs
            sandbox: false,              // Disabled for webview functionality
            webSecurity: true,           // Enforce same-origin policy
        },
        backgroundColor: '#0a0a0f',    // Dark background for modern look
        show: false,                     // Don't show until ready
    });

    // Show window when ready to prevent visual flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Load the index.html of the app
    mainWindow.loadFile('index.html');

    // Open DevTools in development mode only
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    // Handle window closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Setup download handling for the session
    setupDownloadHandling();
}

// ============================================
// Download Manager
// ============================================
function setupDownloadHandling() {
    // Handle downloads from the default session
    session.defaultSession.on('will-download', (event, item, webContents) => {
        handleDownload(item);
    });
}

function handleDownload(item) {
    const downloadId = Date.now().toString();

    const downloadInfo = {
        id: downloadId,
        filename: item.getFilename(),
        url: item.getURL(),
        savePath: item.getSavePath(),
        totalBytes: item.getTotalBytes(),
        receivedBytes: 0,
        state: 'progressing',
        startTime: Date.now(),
        item: item // Keep reference to control download
    };

    downloads.set(downloadId, downloadInfo);

    // Notify renderer about new download
    sendToRenderer('download-started', {
        id: downloadId,
        filename: downloadInfo.filename,
        url: downloadInfo.url,
        totalBytes: downloadInfo.totalBytes
    });

    // Update progress
    item.on('updated', (event, state) => {
        downloadInfo.receivedBytes = item.getReceivedBytes();
        downloadInfo.state = state;
        downloadInfo.savePath = item.getSavePath();

        sendToRenderer('download-progress', {
            id: downloadId,
            receivedBytes: downloadInfo.receivedBytes,
            totalBytes: downloadInfo.totalBytes,
            state: state,
            savePath: downloadInfo.savePath
        });
    });

    // Download completed or failed
    item.once('done', (event, state) => {
        downloadInfo.state = state;
        downloadInfo.receivedBytes = item.getReceivedBytes();
        downloadInfo.savePath = item.getSavePath();
        downloadInfo.endTime = Date.now();

        sendToRenderer('download-completed', {
            id: downloadId,
            state: state,
            savePath: downloadInfo.savePath,
            filename: downloadInfo.filename
        });

        // Remove item reference after completion
        downloadInfo.item = null;
    });
}

function sendToRenderer(channel, data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
    }
}

// ============================================
// IPC Handlers for Download Control
// ============================================
ipcMain.handle('pause-download', (event, downloadId) => {
    const download = downloads.get(downloadId);
    if (download && download.item && download.state === 'progressing') {
        download.item.pause();
        return true;
    }
    return false;
});

ipcMain.handle('resume-download', (event, downloadId) => {
    const download = downloads.get(downloadId);
    if (download && download.item && download.item.isPaused()) {
        download.item.resume();
        return true;
    }
    return false;
});

ipcMain.handle('cancel-download', (event, downloadId) => {
    const download = downloads.get(downloadId);
    if (download && download.item) {
        download.item.cancel();
        downloads.delete(downloadId);
        return true;
    }
    return false;
});

ipcMain.handle('open-download', (event, savePath) => {
    if (savePath) {
        shell.openPath(savePath);
        return true;
    }
    return false;
});

ipcMain.handle('show-download-folder', (event, savePath) => {
    if (savePath) {
        shell.showItemInFolder(savePath);
        return true;
    }
    return false;
});

ipcMain.handle('get-downloads', () => {
    const downloadsList = [];
    downloads.forEach((download, id) => {
        downloadsList.push({
            id: id,
            filename: download.filename,
            url: download.url,
            savePath: download.savePath,
            totalBytes: download.totalBytes,
            receivedBytes: download.receivedBytes,
            state: download.state,
            startTime: download.startTime,
            endTime: download.endTime
        });
    });
    return downloadsList;
});

ipcMain.handle('clear-completed-downloads', () => {
    downloads.forEach((download, id) => {
        if (download.state === 'completed' || download.state === 'cancelled' || download.state === 'interrupted') {
            downloads.delete(id);
        }
    });
    return true;
});

// ============================================
// Window Control IPC Handlers
// ============================================
ipcMain.handle('window-minimize', (event) => {
    const window = event.sender.getOwnerBrowserWindow();
    if (window && !window.isDestroyed()) {
        window.minimize();
        return true;
    }
    return false;
});

ipcMain.handle('window-maximize', (event) => {
    const window = event.sender.getOwnerBrowserWindow();
    if (window && !window.isDestroyed()) {
        if (window.isMaximized()) {
            window.unmaximize();
        } else {
            window.maximize();
        }
        return true;
    }
    return false;
});

ipcMain.handle('window-close', (event) => {
    // Get the window that sent the close request
    const window = event.sender.getOwnerBrowserWindow();
    if (window && !window.isDestroyed()) {
        window.close();
        return true;
    }
    return false;
});

ipcMain.handle('window-toggle-fullscreen', (event) => {
    const window = event.sender.getOwnerBrowserWindow();
    if (window && !window.isDestroyed()) {
        const isFullScreen = !window.isFullScreen();
        window.setFullScreen(isFullScreen);
        
        // Notify renderer about fullscreen state change
        event.sender.send('fullscreen-changed', isFullScreen);
        
        return true;
    }
    return false;
});

// ============================================
// Password Manager with Windows Hello
// ============================================
const { exec } = require('child_process');
const fs = require('fs');

const passwordsPath = path.join(app.getPath('userData'), 'passwords.json');

function loadPasswords() {
    try {
        if (fs.existsSync(passwordsPath)) {
            const data = fs.readFileSync(passwordsPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading passwords:', error);
    }
    return [];
}

function savePasswords(passwords) {
    try {
        fs.writeFileSync(passwordsPath, JSON.stringify(passwords, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error saving passwords:', error);
        return false;
    }
}

ipcMain.handle('password-save', async (event, data) => {
    try {
        const passwords = loadPasswords();
        
        // Check if password already exists
        const existingIndex = passwords.findIndex(p => p.site === data.site && p.username === data.username);
        
        if (existingIndex >= 0) {
            passwords[existingIndex] = { ...passwords[existingIndex], ...data, updatedAt: new Date().toISOString() };
        } else {
            passwords.push({ ...data, id: Date.now(), createdAt: new Date().toISOString() });
        }
        
        savePasswords(passwords);
        return { success: true };
    } catch (error) {
        console.error('Error saving password:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('password-get-all', async (event) => {
    try {
        const passwords = loadPasswords();
        return { success: true, passwords };
    } catch (error) {
        console.error('Error getting passwords:', error);
        return { success: false, error: error.message, passwords: [] };
    }
});

ipcMain.handle('password-delete', async (event, id) => {
    try {
        const passwords = loadPasswords();
        const filteredPasswords = passwords.filter(p => p.id !== id);
        savePasswords(filteredPasswords);
        return { success: true };
    } catch (error) {
        console.error('Error deleting password:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('password-verify-hello', async (event) => {
    try {
        if (process.platform !== 'win32') {
            return { success: false, error: 'Windows Hello is only available on Windows' };
        }

        return new Promise((resolve) => {
            exec('powershell -Command "Add-Type -AssemblyName System.Runtime.WindowsRuntime; [Windows.Security.Credentials.UI.CredentialPicker,Windows.Security.Credentials.UI,ContentType=WindowsRuntime] | Out-Null"', (error) => {
                if (error) {
                    console.error('Windows Hello error:', error);
                    resolve({ success: false, error: 'Windows Hello not available' });
                } else {
                    resolve({ success: true });
                }
            });
        });
    } catch (error) {
        console.error('Error verifying with Windows Hello:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('webview-go-back', (event, webviewId) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        return mainWindow.webContents.executeJavaScript(`
            const webview = document.getElementById('${webviewId}');
            if (webview && webview.canGoBack()) {
                webview.goBack();
                return true;
            }
            return false;
        `);
    }
    return false;
});

ipcMain.handle('webview-go-forward', (event, webviewId) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        return mainWindow.webContents.executeJavaScript(`
            const webview = document.getElementById('${webviewId}');
            if (webview && webview.canGoForward()) {
                webview.goForward();
                return true;
            }
            return false;
        `);
    }
    return false;
});

ipcMain.handle('webview-save-page', async (event, webviewId) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        try {
            // Get the HTML content and URL from the webview
            const result = await mainWindow.webContents.executeJavaScript(`
                (async function() {
                    const webview = document.getElementById('${webviewId}');
                    if (webview) {
                        const html = await webview.executeJavaScript('document.documentElement.outerHTML');
                        const url = webview.src;
                        return { html, url };
                    }
                    return null;
                })();
            `);
            
            if (result && result.html && result.url) {
                const { html, url } = result;
                
                // Generate a filename based on the URL or current timestamp
                let filename = 'saved-page.html';
                try {
                    const urlObj = new URL(url);
                    const pathname = urlObj.pathname;
                    const lastSegment = pathname.split('/').pop();
                    if (lastSegment && lastSegment.includes('.')) {
                        filename = lastSegment;
                    } else {
                        const hostname = urlObj.hostname;
                        filename = `${hostname.replace(/\./g, '-')}-${Date.now()}.html`;
                    }
                } catch (e) {
                    // If URL parsing fails, use timestamp
                    filename = `saved-page-${Date.now()}.html`;
                }
                
                // Create a blob from the HTML content
                const blob = new Blob([html], { type: 'text/html' });
                
                // Create a temporary URL for the blob
                const blobUrl = URL.createObjectURL(blob);
                
                // Download the blob URL with a specific filename
                mainWindow.webContents.downloadURL(blobUrl);
                
                // Listen for download start to set the filename
                mainWindow.webContents.session.once('will-download', (event, item) => {
                    item.setFilename(filename);
                });
                
                // Revoke the blob URL after download
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                
                return true;
            }
        } catch (error) {
            console.error('Error saving page:', error);
        }
    }
    return false;
});

ipcMain.handle('webview-open-devtools', (event, webviewId) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        return mainWindow.webContents.executeJavaScript(`
            const webview = document.getElementById('${webviewId}');
            if (webview) {
                webview.openDevTools();
                return true;
            }
            return false;
        `);
    }
    return false;
});

ipcMain.handle('webview-capture-page', async (event, webviewId) => {
    return { success: false, error: 'Use captureScreenshot in renderer process instead' };
});

ipcMain.handle('file-save-image', async (event, { dataUrl, filename }) => {
    try {
        if (!dataUrl || typeof dataUrl !== 'string') {
            console.error('[DEBUG main] Invalid data URL: must be a string');
            return { success: false, error: 'Invalid data URL: must be a string' };
        }

        if (!filename || typeof filename !== 'string') {
            console.error('[DEBUG main] Invalid filename: must be a string');
            return { success: false, error: 'Invalid filename: must be a string' };
        }

        if (!dataUrl.startsWith('data:image/png;base64,')) {
            console.error('[DEBUG main] Invalid data URL format: must be a PNG image');
            return { success: false, error: 'Invalid data URL format: must be a PNG image' };
        }

        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
        console.log('[DEBUG main] base64Data length:', base64Data.length);
        
        if (base64Data.length === 0) {
            console.error('[DEBUG main] Empty image data');
            return { success: false, error: 'Empty image data' };
        }

        console.log('[DEBUG main] Decoding base64 to buffer...');
        const buffer = Buffer.from(base64Data, 'base64');
        console.log('[DEBUG main] Buffer created, size:', buffer.length);
        
        if (buffer.length === 0) {
            console.error('[DEBUG main] Failed to decode image data');
            return { success: false, error: 'Failed to decode image data' };
        }
        
        const downloadsPath = app.getPath('downloads');
        const filePath = path.join(downloadsPath, filename);
        console.log('[DEBUG main] Saving to:', filePath);
        
        fs.writeFileSync(filePath, buffer);
        console.log('[DEBUG main] File saved successfully');
        
        return { success: true, filePath };
    } catch (error) {
        console.error('[DEBUG main] Error saving image:', error);
        console.error('[DEBUG main] Error stack:', error.stack);
        return { success: false, error: error.message || 'Unknown error occurred' };
    }
});

// ============================================
// Incognito Mode
// ============================================
let incognitoCounter = 0;

function createIncognitoWindow() {
    incognitoCounter++;

    // Create incognito window with ephemeral session (no persistence)
    const incognitoWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'PaperStation - 隐私模式',
        icon: path.join(__dirname, 'assets/icon.png'),
        frame: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true,
            sandbox: false,
            webSecurity: true,
            // Each incognito window gets unique ephemeral partition
            partition: `incognito-${Date.now()}-${incognitoCounter}`
        },
        backgroundColor: '#0a0a0f',
        show: false,
    });

    // Show window when ready
    incognitoWindow.once('ready-to-show', () => {
        incognitoWindow.show();
    });

    // Load index.html with incognito flag
    incognitoWindow.loadFile('index.html', {
        query: { incognito: 'true' }
    });

    // Handle webview downloads in incognito
    incognitoWindow.webContents.session.on('will-download', (event, item, webContents) => {
        handleDownload(item);
    });

    return incognitoWindow;
}

ipcMain.handle('open-incognito-window', () => {
    createIncognitoWindow();
    return true;
});

// ============================================
// App Lifecycle
// ============================================
app.whenReady().then(() => {
    // Initialize context menu for browser functionality
    contextMenu({
        showSaveImageAs: true,
        showInspectElement: false, // Disable default inspect to use our custom one
        showCopyImageAddress: true,
        showCopyLinkAddress: true,
        showCopy: true,
        showPaste: true,
        showSelectAll: false, // Disable default select all to use our custom one
        showSearchWithGoogle: true,
        translations: {
            copy: '复制',
            paste: '粘贴',
            cut: '剪切',
            saveImageAs: '将图片另存为...',
            copyImageAddress: '复制图片地址',
            copyLinkAddress: '复制链接地址',
            searchWithGoogle: '使用Google搜索',
            selectAll: '全选',
            inspectElement: '检查元素'
        },
        prepend: (params, browserWindow) => {
            const menuItems = [];
            
            // Navigation buttons
            menuItems.push(
                {
                    label: '后退',
                    visible: params.mediaType === 'none',
                    click: () => {
                        if (browserWindow.webContents.canGoBack()) {
                            browserWindow.webContents.goBack();
                        }
                    }
                },
                {
                    label: '前进',
                    visible: params.mediaType === 'none',
                    click: () => {
                        if (browserWindow.webContents.canGoForward()) {
                            browserWindow.webContents.goForward();
                        }
                    }
                },
                {
                    label: '刷新页面',
                    visible: params.mediaType === 'none',
                    click: () => {
                        browserWindow.webContents.reload();
                    }
                }
            );
            
            // Separator
            if (params.mediaType === 'none') {
                menuItems.push({ type: 'separator' });
            }
            
            // Link handling
            if (params.linkURL && params.mediaType === 'none') {
                menuItems.push(
                    {
                        label: '在新标签页中打开链接',
                        click: () => {
                            if (mainWindow && !mainWindow.isDestroyed()) {
                                mainWindow.webContents.executeJavaScript(`
                                    if (window.tabManager) {
                                        window.tabManager.createTab('${params.linkURL}');
                                    }
                                `).catch(err => {
                                    console.error('Failed to open link in new tab:', err);
                                });
                            }
                        }
                    }
                );
                menuItems.push({ type: 'separator' });
            }
            
            // Page actions
            menuItems.push(
                {
                    label: '另存为...',
                    visible: params.mediaType === 'none',
                    click: () => {
                        browserWindow.webContents.executeJavaScript(`
                            if (window.tabManager) {
                                const activeTab = window.tabManager.getActiveTab();
                                if (activeTab) {
                                    window.tabManager.savePage(activeTab.id);
                                }
                            }
                        `).catch(err => {
                            console.error('Failed to save page:', err);
                        });
                    }
                },
                {
                    label: '检查',
                    visible: params.mediaType === 'none',
                    click: () => {
                        browserWindow.webContents.openDevTools();
                    }
                }
            );
            
            // Separator
            if (params.mediaType === 'none') {
                menuItems.push({ type: 'separator' });
            }
            
            // Select all
            menuItems.push(
                {
                    label: '全选',
                    visible: params.mediaType === 'none',
                    click: () => {
                        browserWindow.webContents.executeJavaScript('document.execCommand("selectAll")');
                    }
                }
            );
            
            return menuItems;
        }
    });

    createWindow();

    // On macOS, re-create window when dock icon is clicked
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Security: Handle new window requests from webview
app.on('web-contents-created', (event, contents) => {
    // Handle webview download events
    if (contents.getType() === 'webview') {
        contents.session.on('will-download', (event, item, webContents) => {
            handleDownload(item);
        });
    }

    contents.setWindowOpenHandler(({ url }) => {
        // Handle target="_blank" links by opening in new tab
        if (url && url.startsWith('file://')) {
            // For local file links (like error pages), open in new tab
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.executeJavaScript(`
                    if (window.tabManager) {
                        window.tabManager.createTab('${url}');
                    }
                `).catch(err => {
                    console.error('Failed to open new tab:', err);
                });
            }
            return { action: 'deny' };
        }
        
        // For external URLs, open in new tab
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.executeJavaScript(`
                    if (window.tabManager) {
                        window.tabManager.createTab('${url}');
                    }
                `).catch(err => {
                    console.error('Failed to open new tab:', err);
                });
            }
            return { action: 'deny' };
        }
        
        // Deny other new window requests
        return { action: 'deny' };
    });
});
