import { app, shell, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage } from 'electron'
import { cpSync, existsSync } from 'fs'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import trayIcon from '../../resources/tray.ico?asset'
import trayPng from '../../resources/tray.png?asset'
import { deleteSession, listSessions, saveSession } from './store'
import { closeAllShells, closeShell, connectShell, resizeShell, writeShell } from './ssh'
import * as files from './files'
import { cancelTransfer, clearTransfers, retryTransfer, startTransfer } from './transfer'
import { openRemoteFile, releaseAll, releaseTab, resolveEditor } from './edit'
import { getSettings, updateSettings } from './settings'
import { importFonts, listFonts, readFont, removeFont } from './fonts'
import { closeAllLocal, closeLocal, listShells, resizeLocal, spawnLocal, writeLocal } from './pty'
import { checkForUpdates, getUpdateStatus, initUpdater, installUpdate, openReleasePage } from './updater'
import { cleanupPasteDir, clipboardHasImageOnly, stageClipboardImage, stageDroppedFiles } from './clipboard'

// Pin the data dir to "kTerminal" and carry over data from the pre-rename "XSSH" dir.
if (!app.commandLine.hasSwitch('user-data-dir')) {
  const userData = join(app.getPath('appData'), 'kTerminal')
  const legacy = join(app.getPath('appData'), 'XSSH')
  if (!existsSync(userData) && existsSync(legacy)) cpSync(legacy, userData, { recursive: true })
  app.setPath('userData', userData)
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

function showWindow(): void {
  if (!mainWindow) return createWindow()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray(): void {
  // Windows takes the multi-size .ico; menu bars on macOS/Linux want a small PNG.
  tray = new Tray(
    process.platform === 'win32'
      ? trayIcon
      : nativeImage.createFromPath(trayPng).resize({ width: process.platform === 'darwin' ? 18 : 22 })
  )
  tray.setToolTip('kTerminal')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示 kTerminal', click: showWindow },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', showWindow)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    show: false,
    backgroundColor: '#090b10',
    titleBarStyle: 'hidden',
    // macOS draws its traffic lights instead of the window-controls overlay.
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 14, y: 13 } }
      : { titleBarOverlay: { color: '#090b10', symbolColor: '#8790a3', height: 40 } }),
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  const win = mainWindow
  win.on('ready-to-show', () => {
    win.show()
  })

  win.on('close', (e) => {
    const settings = getSettings()
    if (quitting || !settings.closeToTray) return
    e.preventDefault()
    win.hide()
    if (!settings.trayHintShown && process.platform === 'win32') {
      tray?.displayBalloon({ iconType: 'info', title: 'kTerminal 仍在运行', content: '已最小化到托盘，右键托盘图标可退出' })
      updateSettings({ trayHintShown: true })
    }
  })
  win.on('closed', () => {
    mainWindow = null
  })

  win.webContents.setWindowOpenHandler((details) => {
    // Terminal output is untrusted; only hand web URLs to the OS.
    if (/^https?:\/\//i.test(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('sessions:list', () => listSessions())
  ipcMain.handle('sessions:save', (_e, input) => saveSession(input))
  ipcMain.handle('sessions:delete', (_e, id: string) => deleteSession(id))

  ipcMain.handle('ssh:connect', (e, tabId, sessionId, cols, rows, secret) =>
    connectShell(e.sender, tabId, sessionId, cols, rows, secret)
  )
  // A tab is either a local PTY or an SSH shell; the local helpers report whether they handled it.
  ipcMain.on('ssh:write', (_e, tabId: string, data: string) => writeLocal(tabId, data) || writeShell(tabId, data))
  ipcMain.on('ssh:resize', (_e, tabId: string, cols: number, rows: number) =>
    resizeLocal(tabId, cols, rows) || resizeShell(tabId, cols, rows)
  )
  ipcMain.on('ssh:close', (_e, tabId: string) => closeLocal(tabId) || closeShell(tabId))
  ipcMain.handle('pty:shells', () => listShells())
  ipcMain.handle('pty:spawn', (e, tabId: string, shellId: string, cols: number, rows: number, cwd?: string) =>
    spawnLocal(e.sender, tabId, shellId, cols, rows, cwd)
  )
  ipcMain.handle('clipboard:hasImageOnly', () => clipboardHasImageOnly())
  ipcMain.handle('update:status', () => getUpdateStatus())
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.on('update:install', () => installUpdate())
  ipcMain.on('update:openReleasePage', () => openReleasePage())
  ipcMain.handle('dialog:openDirectory', async (e, defaultPath?: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const result = await dialog.showOpenDialog(win, {
      title: '选择目录',
      defaultPath: defaultPath || app.getPath('home'),
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // Errors are rethrown with a readable message; Electron prefixes it, the renderer strips that.
  const handle = <A extends unknown[]>(
    channel: string,
    fn: (...args: A) => unknown
  ): void => {
    ipcMain.handle(channel, async (_e, ...args) => {
      try {
        return await fn(...(args as A))
      } catch (err) {
        throw new Error(files.describeFsError(err))
      }
    })
  }
  handle('local:home', files.localHome)
  handle('local:places', files.localPlaces)
  handle('local:list', files.listLocal)
  handle('local:mkdir', files.mkdirLocal)
  handle('local:rename', files.renameLocal)
  handle('local:remove', files.removeLocal)
  handle('local:open', async (path: string) => {
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })
  ipcMain.on('local:showInFolder', (_e, path: string) => shell.showItemInFolder(path))

  handle('sftp:home', files.remoteHome)
  handle('sftp:list', files.listRemote)
  handle('sftp:mkdir', files.mkdirRemote)
  handle('sftp:rename', files.renameRemote)
  handle('sftp:remove', files.removeRemote)
  handle('clipboard:stageImage', stageClipboardImage)
  handle('term:stageFiles', stageDroppedFiles)

  ipcMain.handle('transfer:start', (e, req) => startTransfer(e.sender, req))
  ipcMain.on('transfer:cancel', (_e, id: string) => cancelTransfer(id))
  ipcMain.on('transfer:retry', (_e, id: string) => retryTransfer(id))
  ipcMain.handle('transfer:clear', () => clearTransfers())

  ipcMain.handle('edit:open', async (e, tabId: string, remotePath: string) => {
    try {
      return await openRemoteFile(e.sender, tabId, remotePath)
    } catch (err) {
      throw new Error(files.describeFsError(err))
    }
  })
  ipcMain.handle('edit:getEditor', () => resolveEditor())
  ipcMain.handle('edit:chooseEditor', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const result = await dialog.showOpenDialog(win, {
      title: '选择本地编辑器',
      filters:
        process.platform === 'win32'
          ? [{ name: '程序', extensions: ['exe'] }]
          : process.platform === 'darwin'
            ? [{ name: '应用程序', extensions: ['app'] }]
            : [],
      properties: ['openFile']
    })
    if (result.canceled) return null
    updateSettings({ editorPath: result.filePaths[0] })
    return resolveEditor()
  })
  ipcMain.handle('edit:resetEditor', () => {
    updateSettings({ editorPath: undefined })
    return resolveEditor()
  })
  ipcMain.on(
    'window:setTheme',
    (e, background: string, symbol: string, material: 'acrylic' | 'none', solid: string) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (!win) return
      const platform = process.platform
      // Native blur exists on Windows (acrylic) and macOS (vibrancy); it only shows through a fully
      // transparent window background. Elsewhere glass themes fall back to an opaque base color.
      const native = material === 'acrylic' && (platform === 'win32' || platform === 'darwin')
      if (platform === 'win32') win.setBackgroundMaterial(native ? 'acrylic' : 'none')
      if (platform === 'darwin') win.setVibrancy(native ? 'under-window' : null)
      const base = native ? '#00000000' : material === 'acrylic' ? solid : background
      win.setBackgroundColor(base)
      if (platform !== 'darwin') win.setTitleBarOverlay({ color: base, symbolColor: symbol, height: 40 })
    }
  )
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('window:getCloseToTray', () => !!getSettings().closeToTray)
  ipcMain.on('window:setCloseToTray', (_e, value: boolean) => updateSettings({ closeToTray: value }))
  ipcMain.handle('fonts:list', () => listFonts())
  ipcMain.handle('fonts:import', (e) => importFonts(BrowserWindow.fromWebContents(e.sender)!))
  ipcMain.handle('fonts:read', (_e, id: string) => readFont(id))
  ipcMain.handle('fonts:remove', (_e, id: string) => removeFont(id))
  ipcMain.on('edit:release', (_e, tabId: string) => releaseTab(tabId))

  ipcMain.handle('dialog:openPrivateKey', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const result = await dialog.showOpenDialog(win, {
      title: '选择私钥文件',
      defaultPath: join(app.getPath('home'), '.ssh'),
      properties: ['openFile', 'showHiddenFiles']
    })
    return result.canceled ? null : result.filePaths[0]
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
}

app.on('before-quit', () => {
  quitting = true
})

app.whenReady().then(() => {
  releaseAll()
  // The default menu is hidden but still owns Alt+<letter> accelerators (Alt+V opened "View"),
  // swallowing keys meant for the terminal. macOS keeps it: Cmd+C/V/Q come from that menu.
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)

  electronApp.setAppUserModelId('com.xssh.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpc()
  initUpdater()
  createWindow()
  createTray()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// will-quit (not window-all-closed) also fires for app.quit(): tray "退出", update-and-restart.
app.on('will-quit', () => {
  closeAllShells()
  closeAllLocal()
  releaseAll()
  cleanupPasteDir()
})
