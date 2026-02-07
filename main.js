const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

if (process.platform === 'win32') {
    app.setAppUserModelId('com.ukeplanlager.pro');
}

let mainWindow;
let pythonProcess;

function setupAutoUpdater() {
    // ENDRET: Sjekk om appen er pakket (ferdig installert).
    // Hvis ikke (utviklermodus), hopp over oppdateringssjekk.
    if (!app.isPackaged) return;

    autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.log('Auto-update feil (normalt i dev-modus):', err);
    });

    autoUpdater.on('update-available', () => {
        if (mainWindow) mainWindow.webContents.send('update_available');
    });

    autoUpdater.on('update-downloaded', () => {
        if (mainWindow) mainWindow.webContents.send('update_downloaded');
    });
    // ... eksisterende kode ...

    autoUpdater.on('update-available', () => {
        if (mainWindow) mainWindow.webContents.send('update_available');
    });

    // NY: Sender nedlastingsprosent til vinduet
    autoUpdater.on('download-progress', (progressObj) => {
        if (mainWindow) mainWindow.webContents.send('download_progress', progressObj.percent);
    });

    autoUpdater.on('update-downloaded', () => {
        if (mainWindow) mainWindow.webContents.send('update_downloaded');
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 700,
        resizable: false,
        frame: false,
        backgroundColor: '#36393f',
        icon: path.join(__dirname, 'app_ikon.ico'),
        title: "UkeplanLager",
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            spellcheck: false
        }
    });

    mainWindow.loadFile('index.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        setupAutoUpdater();
    });

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

// --- Window Controls ---
ipcMain.on('app:minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('app:maximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
    }
});
ipcMain.on('app:close', () => { if (mainWindow) mainWindow.close(); });

ipcMain.on('restart_app', () => {
    autoUpdater.quitAndInstall();
});

// --- NY: FIL-DIALOG FOR Å VELGE DATABASE ---
ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Database', extensions: ['db'] }]
    });
    if (canceled) {
        return null;
    } else {
        return filePaths[0];
    }
});

ipcMain.handle('dialog:saveFile', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Opprett ny database',
        defaultPath: 'ukeplaner_database.db',
        filters: [{ name: 'Database', extensions: ['db'] }]
    });
    if (canceled) {
        return null;
    } else {
        return filePath;
    }
});
// -------------------------------------------

function startPythonBackend() {
    let backendPath;
    let cmd;
    let args;

    if (app.isPackaged) {
        backendPath = path.join(process.resourcesPath, 'app.exe');
        cmd = backendPath;
        args = [];
    } else {
        backendPath = path.join(__dirname, 'app.py');
        cmd = 'python';
        args = [backendPath];
    }

    pythonProcess = spawn(cmd, args);

    pythonProcess.stderr.on('data', (data) => {
        const str = data.toString();
        if (str.includes("HTTP/1.1") || str.includes("Running on")) {
            // Ignorer vanlige logger
        } else {
            console.error(`Python Error: ${str}`);
        }
    });
}

app.on('ready', () => {
    startPythonBackend();
    createWindow();
});

app.on('window-all-closed', function () {
    if (pythonProcess) pythonProcess.kill();
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
    if (mainWindow === null) createWindow();
});