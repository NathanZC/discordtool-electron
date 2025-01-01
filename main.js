const { app, BrowserWindow, ipcMain } = require('electron');
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
    // do this when done
    // win.setMenu(null);
    win.loadFile('index.html');

    win.webContents.on('dom-ready', () => {
        win.webContents.executeJavaScript(`
            window.trashIconPath = '${path.join(__dirname, 'assets', 'images', 'trash.png').replace(/\\/g, '/')}';
        `);
    });
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