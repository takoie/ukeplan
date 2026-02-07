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
    if (!app.isPackaged) return;

    autoUpdater.logger = require("console");

    autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.log('Auto-update feil:', err);
    });

    autoUpdater.on('update-available', () => {
        if (mainWindow) mainWindow.webContents.send('update_available');
    });

    autoUpdater.on('download-progress', (progressObj) => {
        if (mainWindow) mainWindow.webContents.send('download_progress', progressObj.percent);
    });

    autoUpdater.on('update-downloaded', () => {
        if (mainWindow) mainWindow.webContents.send('update_downloaded');
    });

    autoUpdater.on('error', (err) => {
        if (mainWindow) mainWindow.webContents.send('update_error', err.message);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 700,
        resizable: false,
        frame: false,
        backgroundColor: '#0f172a', // Oppdatert til å matche mørk bakgrunn
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

// --- VIKTIG ENDRING HER: RESTART LOGIKK ---
ipcMain.on('restart_app', () => {
    // 1. Drep Python-prosessen umiddelbart
    if (pythonProcess) {
        process.kill(pythonProcess.pid); // Tvinger prosessen til å dø
        pythonProcess = null;
    }

    // 2. Start installasjonen (true, true = silent install, force run)
    autoUpdater.quitAndInstall(true, true);
});

// --- FIL-DIALOG ---
ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Database', extensions: ['db'] }]
    });
    if (canceled) return null;
    else return filePaths[0];
});

ipcMain.handle('dialog:saveFile', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Opprett ny database',
        defaultPath: 'ukeplaner_database.db',
        filters: [{ name: 'Database', extensions: ['db'] }]
    });
    if (canceled) return null;
    else return filePath;
});

// --- PYTHON BACKEND ---
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
        // Ignorer vanlige logger
        if (!str.includes("HTTP/1.1") && !str.includes("Running on")) {
            console.error(`Python Error: ${str}`);
        }
    });
}

app.on('ready', () => {
    startPythonBackend();
    createWindow();
});

// Sikre at Python dør når vinduet lukkes manuelt (X-knappen)
app.on('window-all-closed', function () {
    if (pythonProcess) {
        process.kill(pythonProcess.pid);
        pythonProcess = null;
    }
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
    if (mainWindow === null) createWindow();
});