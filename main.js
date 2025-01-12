const { app, BrowserWindow, ipcMain, Menu, MenuItem } = require('electron');
const path = require('path');
const Store = require('electron-store');

// Initialize electron store
Store.initRenderer();

function createWindow() {
    global.appPath = app.getAppPath();
    
    const win = new BrowserWindow({
        width: 1800,
        height: 1200,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: true,
            additionalArguments: [`--app-path=${app.getAppPath()}`]
        }
    });

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
    ipcMain.on('download-file', async (event, { url, filename }) => {
        try {
            const { download } = await import('electron-dl');
            await download(win, url, {
                saveAs: true,
                filename: filename
            });
        } catch (error) {
            console.error('Download failed:', error);
        }
    });

    // do this when done
    // win.setMenu(null);
    win.loadFile('index.html');
}

app.whenReady().then(() => {
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