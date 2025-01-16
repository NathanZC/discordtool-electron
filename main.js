const { app, BrowserWindow, ipcMain, Menu, MenuItem } = require('electron');
const path = require('path');
const Store = require('electron-store');
require('@electron/remote/main').initialize();

// Initialize electron store
Store.initRenderer();

function createWindow() {
    global.appPath = app.getAppPath();
    
    const win = new BrowserWindow({
        width: 1800,
        height: 1200,
        backgroundColor: '#1e1e1e',
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: true,
            additionalArguments: [`--app-path=${app.getAppPath()}`]
        }
    });

    // Enable remote module for this window
    require('@electron/remote/main').enable(win.webContents);

    // Add this after creating the window
    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self';" +
                    "img-src 'self' https://*.discord.com https://cdn.discordapp.com data: blob:;" +
                    "script-src 'self';" +
                    "style-src 'self' 'unsafe-inline';" +
                    "connect-src 'self' https://*.discord.com https://cdn.discordapp.com https://discord.com ws://discord.com wss://discord.com;" +
                    "media-src 'self' https://*.discord.com https://cdn.discordapp.com blob:;" +
                    "worker-src 'self' blob:;"
                ]
            }
        });
    });

    // Create context menu
    win.webContents.on('context-menu', (event, params) => {
        const menu = new Menu();

        // Only show these items when right clicking on an image
        if (params.mediaType === 'image') {
            menu.append(new MenuItem({
                label: 'Copy Image',
                click: () => {
                    win.webContents.copyImageAt(params.x, params.y);
                }
            }));
            menu.append(new MenuItem({
                label: 'Copy Image URL',
                click: () => {
                    win.webContents.send('copy-url', params.srcURL);
                }
            }));
            menu.append(new MenuItem({ type: 'separator' }));
            menu.append(new MenuItem({
                label: 'Save Image As...',
                click: () => {
                    win.webContents.downloadURL(params.srcURL);
                }
            }));
            menu.append(new MenuItem({
                label: 'Open Image in Browser',
                click: () => {
                    require('electron').shell.openExternal(params.srcURL);
                }
            }));
            menu.popup();
        }
    });

    // Add file download handler
    ipcMain.on('download-file', async (event, { url, filename, saveLocation }) => {
        try {
            await download(BrowserWindow.getFocusedWindow(), url, {
                directory: saveLocation,
                filename: filename,
                saveAs: false  // Don't show save dialog
            });
        } catch (error) {
            console.error('Download failed:', error);
        }
    });

    // do this when done
    // win.setMenu(null);
    win.loadFile('index.html');

    // Show window when ready
    win.once('ready-to-show', () => {
        win.maximize();
        win.show();
    });

}

app.whenReady().then(() => {
    // Configure cache before creating window
    const session = require('electron').session;
    session.defaultSession.clearCache()
        .then(() => {
            console.log('Initial cache cleared');
        })
        .catch(err => {
            console.error('Error clearing initial cache:', err);
        });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    // Send the window-close event to all windows before quitting
    BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('window-close');
    });

    // Give a small delay to allow cleanup to complete
    setTimeout(() => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    }, 100);
});

ipcMain.on('batch-download-files', (event, { files }) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return;

    let completedDownloads = 0;
    const totalFiles = files.length;

    // Create initial progress message
    win.webContents.send('create-progress', {
        message: `Starting download of ${totalFiles} files...`
    });

    // Set up download handler
    win.webContents.session.on('will-download', (event, item, webContents) => {
        const file = files.find(f => item.getURL() === f.url);
        if (!file) return;

        const filePath = path.join(file.saveLocation, file.filename);
        item.setSavePath(filePath);

        item.on('done', (_, state) => {
            completedDownloads++;
            
            // Update progress
            win.webContents.send('update-progress', {
                message: `Downloading: ${completedDownloads}/${totalFiles} files (${Math.round(completedDownloads/totalFiles * 100)}%)`
            });

            // Check if all downloads are complete
            if (completedDownloads === totalFiles) {
                win.webContents.send('clear-progress');
            }
        });
    });

    // Start downloads
    files.forEach(file => {
        win.webContents.downloadURL(file.url);
    });
});

// Update single file download handler too
ipcMain.on('download-file', (event, { url, filename, saveLocation }) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return;

    win.webContents.session.on('will-download', (event, item, webContents) => {
        const filePath = path.join(saveLocation, filename);
        item.setSavePath(filePath);
    });

    win.webContents.downloadURL(url);
});