const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

// VIKTIG: Dette hjelper Windows å gruppere vinduet riktig når det er installert
if (process.platform === 'win32') {
    app.setAppUserModelId('com.ukeplanlager.pro');
}

let mainWindow;
let pythonProcess;

// --- AUTO UPDATE LOGIC ---
function setupAutoUpdater() {
    // Sjekker etter oppdateringer (logger feil i konsoll hvis dev-modus)
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.log('Auto-update feil (normalt i dev-modus):', err);
    });

    // Sender beskjed til index.html når en oppdatering er funnet
    autoUpdater.on('update-available', () => {
        if (mainWindow) mainWindow.webContents.send('update_available');
    });

    // Sender beskjed når oppdateringen er ferdig lastet ned
    autoUpdater.on('update-downloaded', () => {
        if (mainWindow) mainWindow.webContents.send('update_downloaded');
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 655, // Beholder din spesifikke høyde
        resizable: false, 
        frame: false,
        backgroundColor: '#36393f',
        icon: path.join(__dirname, 'icon.ico'),
        title: "UkeplanLager",
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            spellcheck: false // Slår av rød strek under norske ord
        }
    });

    mainWindow.loadFile('index.html');

    // Start sjekk etter oppdateringer når vinduet er klart
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

// Håndterer omstart for oppdatering
ipcMain.on('restart_app', () => {
    autoUpdater.quitAndInstall();
});

function startPythonBackend() {
    let backendPath;
    let cmd;
    let args;

    if (app.isPackaged) {
        // I produksjon ligger app.exe i resources-mappen
        backendPath = path.join(process.resourcesPath, 'app.exe');
        cmd = backendPath;
        args = [];
    } else {
        // I utvikling
        backendPath = path.join(__dirname, 'app.py');
        cmd = 'python'; 
        args = [backendPath];
    }

    pythonProcess = spawn(cmd, args);

    // Valgfritt: Logg feil fra Python hvis det skjer noe
    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python Error: ${data}`);
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