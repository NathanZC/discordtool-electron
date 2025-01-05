const { app, BrowserWindow, ipcMain, Menu, MenuItem } = require('electron');
const path = require('path');
const Store = require('electron-store');

// Initialize electron store
Store.initRenderer();

function createWindow() {
    global.appPath = app.getAppPath();
    
    const win = new BrowserWindow({
        width: 1600,
        height: 1200,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: true,
            additionalArguments: [`--app-path=${app.getAppPath()}`],
            contentSecurityPolicy: `
                default-src 'self';
                img-src 'self' https://*.discord.com https://cdn.discord.com;
                script-src 'self';
                style-src 'self' 'unsafe-inline';
            `
        }
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
    if (process.platform !== 'darwin') {
        app.quit();
    }
});