// Renders build/icon.svg + build/tray.svg into the PNG/ICO assets.
// Run with: npm run icons   (uses Electron's Chromium as the SVG rasterizer)
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

const root = resolve(import.meta.dirname, '..')
const read = (f) => readFileSync(join(root, f), 'utf8')

function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const dir = Buffer.alloc(16 * images.length)
  let offset = 6 + dir.length
  images.forEach(({ size, png }, i) => {
    const o = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, o)
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1)
    dir.writeUInt16LE(1, o + 4)
    dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(png.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += png.length
  })
  return Buffer.concat([header, dir, ...images.map((i) => i.png)])
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false })
  await win.loadURL('data:text/html,<canvas></canvas>')

  const render = async (svg, size) => {
    const dataUrl = await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
          const c = document.createElement('canvas')
          c.width = c.height = ${size}
          const ctx = c.getContext('2d')
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(img, 0, 0, ${size}, ${size})
          resolve(c.toDataURL('image/png'))
        }
        img.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}'
      })`)
    return Buffer.from(dataUrl.split(',')[1], 'base64')
  }

  const icon = read('build/icon.svg')
  const tray = read('build/tray.svg')

  writeFileSync(join(root, 'build/icon.png'), await render(icon, 1024))
  writeFileSync(join(root, 'resources/icon.png'), await render(icon, 512))
  const appSizes = [16, 24, 32, 48, 64, 128, 256]
  writeFileSync(
    join(root, 'build/icon.ico'),
    ico(await Promise.all(appSizes.map(async (size) => ({ size, png: await render(size <= 32 ? tray : icon, size) }))))
  )
  const traySizes = [16, 20, 24, 32, 40, 48, 64]
  writeFileSync(
    join(root, 'resources/tray.ico'),
    ico(await Promise.all(traySizes.map(async (size) => ({ size, png: await render(tray, size) }))))
  )
  writeFileSync(join(root, 'resources/tray.png'), await render(tray, 32))
  console.log('icons written')
  app.quit()
})
