const { app, BrowserWindow, Menu, dialog, powerSaveBlocker, protocol, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')

const DEV = process.argv.includes('--dev')
const DEV_URL = process.env.ELECTRON_START_URL || 'http://127.0.0.1:5173'
const DIST = path.join(__dirname, '..', 'dist')
const SCHEME = 'pool'

// A standard, secure scheme keeps absolute /assets paths, modules and
// localStorage working without turning the file system into a web root.
protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}])

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}

function fileFor(requestUrl) {
  let pathname
  try { pathname = new URL(requestUrl).pathname } catch { return null }
  if (!pathname || pathname === '/') pathname = '/index.html'
  const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)))
  return file.startsWith(DIST + path.sep) ? file : null
}

async function serve(request) {
  const file = fileFor(request.url)
  if (!file) return new Response('Forbidden', { status: 403 })
  try {
    const body = await fsp.readFile(file)
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
    return new Response(body, { headers: { 'Content-Type': type } })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

const statePath = () => path.join(app.getPath('userData'), 'window.json')

function readState() {
  try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')) } catch { return null }
}

function saveState(win) {
  if (!win || win.isDestroyed() || win.isFullScreen()) return
  try { fs.writeFileSync(statePath(), JSON.stringify(win.getNormalBounds())) } catch {}
}

let win = null
let blocker = null

function createWindow() {
  const saved = readState()
  win = new BrowserWindow({
    width: saved?.width || 1600,
    height: saved?.height || 900,
    x: saved?.x,
    y: saved?.y,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#0b1a1d',
    title: '阈限深水区',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  win.once('ready-to-show', () => win.show())
  win.webContents.on('did-fail-load', (_event, code, description, url) => console.error('did-fail-load', code, description, url))
  win.webContents.on('preload-error', (_event, preloadPath, error) => console.error('preload-error', preloadPath, error))
  win.webContents.on('console-message', (_event, level, message, line, source) => {
    if (level >= 3) console.log(`renderer error: ${message} (${source}:${line})`)
  })
  win.on('close', () => saveState(win))
  win.on('focus', () => { if (blocker === null) blocker = powerSaveBlocker.start('prevent-display-sleep') })
  win.on('blur', () => {
    if (blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null }
    // Never leave the OS cursor trapped by a pointer lock after alt-tabbing.
    if (win && !win.isDestroyed()) win.webContents.executeJavaScript(
      'document.pointerLockElement && document.exitPointerLock()', true).catch(() => {})
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = DEV ? url.startsWith(DEV_URL) : url.startsWith(SCHEME + '://')
    if (allowed) return
    event.preventDefault()
    if (/^https?:/i.test(url)) void shell.openExternal(url)
  })
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F11') { event.preventDefault(); win.setFullScreen(!win.isFullScreen()) }
    else if (input.key === 'F12') { event.preventDefault(); win.webContents.toggleDevTools() }
    else if (!DEV && (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r'))) {
      event.preventDefault(); win.webContents.reload()
    }
  })

  if (DEV) win.loadURL(DEV_URL)
  else win.loadURL(`${SCHEME}://app/index.html`)

  // Smoke test: `electron . --shot` writes one frame and exits.
  if (process.argv.includes('--shot')) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      try {
        win.setAlwaysOnTop(true)
        win.show()
        win.focus()
        await new Promise(resolve => setTimeout(resolve, 1200))
        const image = await win.webContents.capturePage()
        const out = path.join(__dirname, '..', '.work-backup', 'electron-shot.png')
        fs.mkdirSync(path.dirname(out), { recursive: true })
        fs.writeFileSync(out, image.toPNG())
        console.log('shot:', out)
      } catch (error) {
        console.error('shot failed:', error)
      } finally {
        app.quit()
      }
    }, 18000))
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('cnb.cool.waterpool')
    Menu.setApplicationMenu(null)

    if (!DEV && !fs.existsSync(path.join(DIST, 'index.html'))) {
      dialog.showErrorBox('缺少构建产物', '请先在项目目录执行 npm run build，然后再启动桌面版。')
      app.quit()
      return
    }

    protocol.handle(SCHEME, serve)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    if (blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null }
  })
}
