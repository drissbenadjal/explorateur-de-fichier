import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import os from 'os'

function listDrives() {
  // Windows: tester les lettres A-Z et enrichir avec free/size si possible
  const drives = []
  if (process.platform === 'win32') {
    let diskInfoMap = {}
    try {
      const out = execSync('wmic logicaldisk get Caption,FreeSpace,Size /format:csv', {
        encoding: 'utf8'
      })
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !/^Node,Caption,FreeSpace,Size/i.test(l))
      for (const line of out) {
        const parts = line.split(',')
        if (parts.length >= 4) {
          const caption = parts[1] // C:
          const freeStr = parts[2]
          const sizeStr = parts[3]
          const letter = caption?.replace(/:\\?$/, '')?.toUpperCase()
          if (letter && /[A-Z]/.test(letter)) {
            const free = parseInt(freeStr, 10)
            const size = parseInt(sizeStr, 10)
            if (!isNaN(free) && !isNaN(size)) diskInfoMap[letter] = { free, size }
          }
        }
      }
    } catch {
      // wmic peut ne pas exister (certaines versions Windows) => silencieux
    }
    for (let i = 67; i <= 90; i++) {
      // C à Z
      const letter = String.fromCharCode(i)
      const root = letter + ':\\'
      try {
        if (fs.existsSync(root)) {
          const extra = diskInfoMap[letter] || {}
          drives.push({ name: letter + ':', path: root, isDir: true, ...extra })
        }
      } catch {
        // ignore
      }
    }
  } else {
    // Unix: simplement racine (sans info stockage par défaut)
    drives.push({ name: '/', path: '/', isDir: true })
  }
  return drives
}

function safeReadDir(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    return entries
      .map((d) => {
        const full = path.join(dir, d.name)
        let size = null
        let mtime = null
        try {
          const st = fs.statSync(full)
          // taille uniquement pour les fichiers
          if (d.isFile()) size = st.size
          mtime = st.mtimeMs
        } catch {
          // ignore stat error
        }
        return {
          name: d.name,
          path: full,
          isDir: d.isDirectory(),
          size,
          mtime
        }
      })
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  } catch (e) {
    return { error: e.message }
  }
}

function registerFsIpc() {
  ipcMain.handle('fs:home', () => app.getPath('home'))
  ipcMain.handle('fs:list', (_e, dir) => {
    return safeReadDir(dir)
  })
  ipcMain.handle('fs:drives', () => listDrives())
  ipcMain.handle('fs:readFile', (_e, filePath) => {
    try {
      const stat = fs.statSync(filePath)
      const max = 2 * 1024 * 1024 // 2MB max pour preview
      if (stat.size > max) {
        return { error: 'Fichier trop volumineux (>2MB) pour prévisualisation.' }
      }
      const ext = path.extname(filePath).toLowerCase().slice(1)
      const imgExt = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
      const buffer = fs.readFileSync(filePath)
      if (imgExt.includes(ext)) {
        if (ext === 'svg') {
          return { content: buffer.toString('utf8'), name: path.basename(filePath), kind: 'svg' }
        }
        const mime = ext === 'jpg' ? 'image/jpeg' : 'image/' + (ext === 'svg' ? 'svg+xml' : ext)
        return {
          image: buffer.toString('base64'),
          mime,
          name: path.basename(filePath),
          kind: 'image'
        }
      }
      // Détection simple binaire
      const isBinary = buffer.some((b) => b === 0)
      if (isBinary) {
        return { error: 'Fichier binaire, pas de prévisualisation.' }
      }
      return { content: buffer.toString('utf8'), name: path.basename(filePath), kind: 'text' }
    } catch (e) {
      return { error: e.message }
    }
  })
  ipcMain.handle('fs:known', () => {
    return {
      home: app.getPath('home'),
      desktop: app.getPath('desktop'),
      documents: app.getPath('documents'),
      downloads: app.getPath('downloads')
    }
  })
  ipcMain.handle('fs:open', async (_e, targetPath) => {
    try {
      if (!targetPath) return false
      const result = await shell.openPath(targetPath)
      if (result) return { error: result }
      return { ok: true }
    } catch (e) {
      return { error: e.message }
    }
  })
  ipcMain.handle('fs:icon', async (_e, targetPath) => {
    try {
      if (!targetPath) return { error: 'path manquant' }
      const ext = path.extname(targetPath).toLowerCase()
      const { nativeImage } = require('electron')

      async function getIconWithFallback(p) {
        const sizes = ['large', 'normal', 'small']
        for (const size of sizes) {
          try {
            const img = await app.getFileIcon(p, { size })
            if (img && !img.isEmpty()) return img
          } catch {
            // continue
          }
        }
        return null
      }

      // ===================
      // Raccourcis Windows (.lnk)
      // ===================
      if (ext === '.lnk') {
        try {
          const info = shell.readShortcutLink(targetPath)
          const expandEnv = (p) => p.replace(/%([^%]+)%/g, (m, v) => process.env[v] || m)

          // 1. Icône spécifique définie dans le raccourci
          if (info?.icon) {
            try {
              let iconPath = expandEnv(info.icon.trim().replace(/"/g, ''))
              if (!path.isAbsolute(iconPath))
                iconPath = path.resolve(path.dirname(targetPath), iconPath)
              if (fs.existsSync(iconPath)) {
                const lower = iconPath.toLowerCase()
                if (/\.(ico|png|jpg|jpeg|bmp)$/i.test(lower)) {
                  const buf = fs.readFileSync(iconPath)
                  let img = nativeImage.createFromBuffer(buf)
                  if ((!img || img.isEmpty()) && /\.ico$/i.test(lower))
                    img = nativeImage.createFromPath(iconPath)
                  if (img && !img.isEmpty())
                    return { data: img.toPNG().toString('base64'), mime: 'image/png' }
                }
                if (/\.(exe|dll)$/i.test(lower)) {
                  const exeImg = await getIconWithFallback(iconPath)
                  if (exeImg) return { data: exeImg.toPNG().toString('base64'), mime: 'image/png' }
                }
              }
            } catch {
              // ignore icon explicit
            }
          }
          // 2. Cible du raccourci
          if (info?.target) {
            try {
              let real = info.target
              if (!path.isAbsolute(real)) {
                if (info.workingDirectory && path.isAbsolute(info.workingDirectory))
                  real = path.resolve(info.workingDirectory, real)
                else real = path.resolve(path.dirname(targetPath), real)
              }
              if (fs.existsSync(real)) {
                const imgReal = await getIconWithFallback(real)
                if (imgReal) return { data: imgReal.toPNG().toString('base64'), mime: 'image/png' }
              }
            } catch {
              // ignore target
            }
          }
        } catch {
          // ignore readShortcutLink
        }
        // 3. Fallback sur le .lnk lui-même
        const img = await getIconWithFallback(targetPath)
        if (img) return { data: img.toPNG().toString('base64'), mime: 'image/png' }
        return { error: 'icone lnk introuvable' }
      }

      // ===================
      // Fichiers Internet (.url)
      // ===================
      if (ext === '.url') {
        let iconCandidate = null
        try {
          const rawBuf = fs.readFileSync(targetPath)
          let raw
          if (rawBuf[0] === 0xff && rawBuf[1] === 0xfe) raw = rawBuf.toString('utf16le')
          else raw = rawBuf.toString('utf8')
          if (raw.includes('\u0000')) raw = rawBuf.toString('utf16le')
          raw = raw.split('\x00').join('')
          const urlMatch = raw.match(/^URL=(.+)$/im)
          const iconMatch = raw.match(/^IconFile=(.+)$/im)
          const expandEnv = (p) => p.replace(/%([^%]+)%/g, (m, v) => process.env[v] || m)
          if (iconMatch) {
            let iconFile = expandEnv(iconMatch[1].trim().replace(/"/g, ''))
            if (!path.isAbsolute(iconFile))
              iconFile = path.resolve(path.dirname(targetPath), iconFile)
            if (fs.existsSync(iconFile)) iconCandidate = iconFile
          }
          if (iconCandidate) {
            try {
              const lower = iconCandidate.toLowerCase()
              if (/\.(ico|png|jpg|jpeg|bmp)$/i.test(lower)) {
                const b = fs.readFileSync(iconCandidate)
                let img = nativeImage.createFromBuffer(b)
                if ((!img || img.isEmpty()) && /\.ico$/i.test(lower))
                  img = nativeImage.createFromPath(iconCandidate)
                if (img && !img.isEmpty())
                  return { data: img.toPNG().toString('base64'), mime: 'image/png' }
              }
              if (/\.(exe|dll)$/i.test(lower)) {
                const exeImg = await getIconWithFallback(iconCandidate)
                if (exeImg) return { data: exeImg.toPNG().toString('base64'), mime: 'image/png' }
              }
            } catch {
              // ignore icon file
            }
          }
          if (urlMatch) {
            try {
              const rawUrl = urlMatch[1].trim().replace(/"/g, '')
              if (/^https?:\/\//i.test(rawUrl)) {
                const u = new URL(rawUrl)
                const base = `${u.protocol}//${u.host}`
                const candidates = [
                  `${base}/favicon.ico`,
                  `${base}/favicon.png`,
                  `${base}/apple-touch-icon.png`,
                  `${base}/favicon-32x32.png`,
                  `${base}/favicon-192x192.png`
                ]
                for (const fav of candidates) {
                  try {
                    const r = await fetch(fav)
                    if (r.ok) {
                      const buf = Buffer.from(await r.arrayBuffer())
                      if (buf.length) {
                        let img = nativeImage.createFromBuffer(buf)
                        if (img && !img.isEmpty())
                          return { data: img.toPNG().toString('base64'), mime: 'image/png' }
                        return {
                          data: buf.toString('base64'),
                          mime: r.headers.get('content-type') || 'image/x-icon'
                        }
                      }
                    }
                  } catch {
                    // next candidate
                  }
                }
              }
            } catch {
              // ignore url parsing
            }
          }
        } catch {
          // ignore read
        }
        const img = await getIconWithFallback(targetPath)
        if (img) return { data: img.toPNG().toString('base64'), mime: 'image/png' }
        return { error: 'icone url introuvable' }
      }

      // Autres fichiers
      const img = await getIconWithFallback(targetPath)
      if (img) return { data: img.toPNG().toString('base64'), mime: 'image/png' }
      return { error: 'icone indisponible' }
    } catch (e) {
      return { error: e.message }
    }
  })
  ipcMain.handle('fs:rename', (_e, oldPath, newName) => {
    try {
      if (!oldPath || !newName) return { error: 'param manquant' }
      newName = newName.trim()
      if (!newName) return { error: 'Nom vide' }
      if (/[*"<>:?|/\\]/.test(newName)) return { error: 'Caractères invalides' }
      const dir = path.dirname(oldPath)
      const newPath = path.join(dir, newName)
      if (newPath === oldPath) return { ok: true, newPath }
      if (fs.existsSync(newPath)) return { error: 'Existe déjà' }
      fs.renameSync(oldPath, newPath)
      return { ok: true, newPath }
    } catch (e) {
      return { error: e.message }
    }
  })

  // ========= Stats système =========
  ipcMain.handle('app:stats', () => {
    try {
      const totalMem = os.totalmem()
      const freeMem = os.freemem()
      const usedMem = totalMem - freeMem
      const cpus = os.cpus()
      const cpuModel = cpus?.[0]?.model || 'N/A'
      const cpuCores = cpus.length
      const load = os.loadavg?.() || []
      return {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        uptime: os.uptime(),
        memory: {
          total: totalMem,
          free: freeMem,
          used: usedMem,
          pct: totalMem ? usedMem / totalMem : 0
        },
        cpu: { model: cpuModel, cores: cpuCores, load }
      }
    } catch (e) {
      return { error: e.message }
    }
  })

  // ========= Raccourcis utilisateur =========
  function shortcutsFile() {
    try {
      return path.join(app.getPath('userData'), 'shortcuts.json')
    } catch {
      return path.join(process.cwd(), 'shortcuts.json')
    }
  }
  function readShortcuts() {
    const f = shortcutsFile()
    try {
      if (!fs.existsSync(f)) return []
      const raw = fs.readFileSync(f, 'utf8')
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) return arr
      return []
    } catch {
      return []
    }
  }
  function writeShortcuts(list) {
    try {
      fs.writeFileSync(shortcutsFile(), JSON.stringify(list, null, 2), 'utf8')
    } catch {
      // ignore
    }
  }
  ipcMain.handle('app:shortcuts:list', () => {
    return readShortcuts()
  })
  ipcMain.handle('app:shortcuts:add', (_e, item) => {
    try {
      if (!item || !item.name || !item.path) return { error: 'données manquantes' }
      const list = readShortcuts()
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      const rec = { id, name: item.name.trim(), path: item.path }
      list.push(rec)
      writeShortcuts(list)
      return { ok: true, item: rec }
    } catch (e) {
      return { error: e.message }
    }
  })
  ipcMain.handle('app:shortcuts:remove', (_e, id) => {
    try {
      if (!id) return { error: 'id manquante' }
      let list = readShortcuts()
      const before = list.length
      list = list.filter((s) => s.id !== id)
      writeShortcuts(list)
      return { ok: true, removed: before - list.length }
    } catch (e) {
      return { error: e.message }
    }
  })
}

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 860,
    minHeight: 520,
    show: false,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    autoHideMenuBar: true,
    transparent: false,
    backgroundColor: '#ffffffff',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Événements pour l'état maximise/restaure
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('win:maximized', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('win:maximized', false)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// IPC fenêtres personnalisées
function registerWindowControls() {
  function current() {
    return BrowserWindow.getFocusedWindow()
  }
  ipcMain.handle('win:minimize', () => {
    current()?.minimize()
  })
  ipcMain.handle('win:maximize', () => {
    const w = current()
    if (!w) return false
    if (w.isMaximized()) {
      w.restore()
      return false
    }
    w.maximize()
    return true
  })
  ipcMain.handle('win:close', () => {
    current()?.close()
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  registerFsIpc()
  registerWindowControls()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
