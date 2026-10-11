import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { SHELL_URL, STATUS_CHANNEL } from '../shared/bootstrap-contracts';
import type { BootstrapController, BootstrapResult } from '../shared/bootstrap-contracts';
import { isRequest, isTrustedCaller, parseResult, safeError } from '../shared/bootstrap-validation';

export function registerBootstrapIpc(window: BrowserWindow, controller: BootstrapController): () => void {
  const owned = window.webContents;
  let disposed = false;
  ipcMain.handle(STATUS_CHANNEL, (event, value: unknown): BootstrapResult => {
    try {
      if (disposed || window.isDestroyed() || owned.isDestroyed() || event.sender !== owned) return { ok: false, error: safeError('UNAUTHORIZED_CALLER') };
      const frame = owned.mainFrame;
      if (!isTrustedCaller({ sender: event.sender, frame: event.senderFrame, url: event.senderFrame?.url ?? '' },
        { sender: owned, mainFrame: frame, url: SHELL_URL }) || frame.url !== SHELL_URL || owned.getURL() !== SHELL_URL)
        return { ok: false, error: safeError('UNAUTHORIZED_CALLER') };
      if (!isRequest(value)) return { ok: false, error: safeError('INVALID_REQUEST') };
      const result = parseResult({ ok: true, snapshot: controller.snapshot() });
      return result ?? { ok: false, error: safeError('INTERNAL') };
    } catch { return { ok: false, error: safeError('INTERNAL') }; }
  });
  return () => {
    if (disposed) return;
    disposed = true;
    ipcMain.removeHandler(STATUS_CHANNEL);
  };
}
