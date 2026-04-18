import { Tray, Menu, app, nativeImage } from 'electron';
import { restoreMainWindow } from './window.js';

let tray: Tray | null = null;

export function createTray(): void {
  // 使用默认图标（后续替换为自定义图标）
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开窗口',
      click: () => restoreMainWindow(),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Coding History');
  tray.setContextMenu(contextMenu);

  // 点击托盘图标显示窗口
  tray.on('click', () => {
    restoreMainWindow();
  });
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
