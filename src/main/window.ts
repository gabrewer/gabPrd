import { BrowserWindow, Menu } from 'electron';
import { SHELL_URL } from '../shared/bootstrap-contracts';

/** Create only: main must register IPC and the asset protocol before loading SHELL_URL. */
export function createBootstrapWindow(diagnosticFixture = false): BrowserWindow {
  const window = new BrowserWindow({
    title: diagnosticFixture ? 'PRD Creator — Bootstrap' : 'PRD Creator',
    width: 1000,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      additionalArguments: diagnosticFixture ? ['--gabprd-bootstrap-fixture-ui'] : ['--gabprd-product'],
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
    },
  });
  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (url !== SHELL_URL) event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    if (url !== SHELL_URL) event.preventDefault();
  });
  // Subframe navigations are not part of this single-document shell either.
  contents.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame || event.url !== SHELL_URL) event.preventDefault();
  });
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  contents.session.setPermissionCheckHandler(() => false);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'close' }] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
  ]));
  return window;
}
