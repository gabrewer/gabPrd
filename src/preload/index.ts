import { contextBridge, ipcRenderer } from 'electron';
import { CONTRACT_VERSION, STATUS_CHANNEL } from '../shared/bootstrap-contracts';
import type { BootstrapResult } from '../shared/bootstrap-contracts';
import { parseResult, safeError } from '../shared/bootstrap-validation';

const bootstrap = Object.freeze({
  async getStatus(): Promise<BootstrapResult> {
    try {
      const value: unknown = await ipcRenderer.invoke(STATUS_CHANNEL, { contractVersion: CONTRACT_VERSION });
      return parseResult(value) ?? Object.freeze({ ok: false, error: safeError('INTERNAL') });
    } catch {
      return Object.freeze({ ok: false, error: safeError('INTERNAL') });
    }
  },
});
contextBridge.exposeInMainWorld('gabPrd', Object.freeze({ bootstrap }));
