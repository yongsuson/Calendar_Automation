const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 8765;

function startServer() {
  const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    const filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(filePath);
      const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css' }[ext] || 'text/plain';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    });
  });
  server.listen(PORT);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 860,
    minWidth: 900,
    minHeight: 700,
    title: 'MOP Calendar 자동 등록',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#0d0d0d',
  });

  win.loadURL(`http://localhost:${PORT}/index.html`);
  win.setMenuBarVisibility(false);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://accounts.google.com')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  startServer();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
