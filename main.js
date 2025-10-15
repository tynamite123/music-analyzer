const { app, BrowserWindow } = require('electron');
const net = require('net');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3001;

function isPortAvailable(port, callback) {
  const tester = net.createServer()
    .once('error', () => callback(false))
    .once('listening', () => tester.once('close', () => callback(true)).close())
    .listen(port);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
    },
  });

  console.log(`🧭 Loading http://localhost:${PORT}`);
  win.loadURL(`http://localhost:${PORT}`);

  win.webContents.on('did-fail-load', (event, code, desc) => {
    console.error("❌ Electron failed to load:", desc);
  });
}

app.once('ready', () => {
  isPortAvailable(PORT, (available) => {
    if (available) {
      console.log(`✅ Port ${PORT} is free. Starting backend...`);

      // Cross-platform Python venv detection
      const isWin = process.platform === "win32";
      const pythonCmd = isWin
        ? path.join(__dirname, "venv", "Scripts", "python.exe")
        : path.join(__dirname, "venv", "bin", "python");

      // Start Node backend
      const server = exec('node index.js');

      server.stdout.on('data', data => console.log(`[Backend]: ${data}`));
      server.stderr.on('data', data => console.error(`[Backend ERROR]: ${data}`));

      setTimeout(createWindow, 2000);
    } else {
      console.log(`⚠️ Port ${PORT} already in use. Skipping backend start.`);
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
