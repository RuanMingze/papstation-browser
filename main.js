const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('path');

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
        title: 'Papstation',
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

    // Open DevTools (disabled)
    // mainWindow.webContents.openDevTools();

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
        title: 'Papstation - 隐私模式',
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
        // Could open in new tab instead
        return { action: 'deny' };
    });
});
