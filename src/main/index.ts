import { app, shell, BrowserWindow, ipcMain, dialog, Menu, Tray } from 'electron'
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
  tray = new Tray(process.platform === 'win32' ? trayIcon : trayPng)
  tray.setToolTip('XSSH')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示 XSSH', click: showWindow },
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
    titleBarOverlay: { color: '#090b10', symbolColor: '#8790a3', height: 40 },
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
      tray?.displayBalloon({ iconType: 'info', title: 'XSSH 仍在运行', content: '已最小化到托盘，右键托盘图标可退出' })
      updateSettings({ trayHintShown: true })
    }
  })
  win.on('closed', () => {
    mainWindow = null
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
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
  ipcMain.on('ssh:write', (_e, tabId: string, data: string) => writeShell(tabId, data))
  ipcMain.on('ssh:resize', (_e, tabId: string, cols: number, rows: number) =>
    resizeShell(tabId, cols, rows)
  )
  ipcMain.on('ssh:close', (_e, tabId: string) => closeShell(tabId))

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
      filters: [{ name: '程序', extensions: ['exe'] }],
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
  ipcMain.on('window:setTheme', (e, background: string, symbol: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    win.setBackgroundColor(background)
    win.setTitleBarOverlay({ color: background, symbolColor: symbol, height: 40 })
  })
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

  electronApp.setAppUserModelId('com.xssh.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpc()
  createWindow()
  createTray()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeAllShells()
  releaseAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
