<p align="center">
  <img src="resources/icon.png" width="96" alt="kTerminal" />
</p>

<h1 align="center">kTerminal</h1>

<p align="center">SSH 终端与 SFTP 文件传输一体化的桌面工具（Windows）</p>

## 功能

- **多标签 SSH 终端**：基于 xterm.js（WebGL 渲染），支持密码 / 私钥认证，密码经系统加密（DPAPI）保存
- **双栏 SFTP 文件面板**：与终端共用同一条连接；拖拽、双击、右键上传下载，支持文件夹递归传输
- **传输队列**：实时进度、速度、剩余时间，可取消与重试
- **远程文件本地编辑**：右键用 VS Code / Notepad++ 等打开，保存后自动上传回服务器
- **主题与配色**：6 套内置主题 + 跟随系统；自定义终端配色，可导入 / 导出 Windows Terminal 配色 JSON
- **自定义字体**：导入 TTF / OTF / WOFF / WOFF2 字体文件
- **托盘**：可选关闭窗口时最小化到托盘

## 下载

在 [Releases](https://github.com/kk1181958464/kTerminal/releases) 页面下载 `kTerminal-x.y.z-setup.exe` 安装即可。

## 开发

需要 Node.js 22+。

```bash
npm install
npm run dev        # 启动开发模式
npm run build:win  # 打包 Windows 安装程序，输出到 dist/
npm run icons      # 由 build/icon.svg、build/tray.svg 重新生成图标
```

## 发布

推送 `v` 开头的 tag 即可触发 GitHub Actions 自动打包并创建 Release，安装包版本号取自 tag：

```bash
git tag v1.0.1
git push origin v1.0.1
```

## 技术栈

Electron · React · TypeScript · Vite (electron-vite) · Tailwind CSS · Framer Motion · Zustand · ssh2 · xterm.js

## 许可证

[MIT](LICENSE)
