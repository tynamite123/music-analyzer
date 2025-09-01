const { app, BrowserWindow } = require('electron');
const net = require('net');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3001;

function isPortAvailable(port, callback) {
  const tester = net.createServer()
    .once('error', err => {
      callback(false);
    })
    .once('listening', () => {
      tester.once('close', () => callback(true)).close();
    })
    .listen(port);
}

function createWindow() {
  const win = new BrowserWindow({
  width: 1000,
  height: 800,
  webPreferences: {
    contextIsolation: false,  // ✅ allows scripts to run
    nodeIntegration: false,   // stays off for security
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
      const server = exec('node index.js');

      server.stdout.on('data', data => console.log(`[Backend]: ${data}`));
      server.stderr.on('data', data => console.error(`[Backend ERROR]: ${data}`));

      setTimeout(() => {
        createWindow();
      }, 2000);
    } else {
      console.log(`⚠️ Port ${PORT} already in use. Skipping backend start.`);
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
