import { contextBridge, ipcRenderer } from 'electron';
import { CONTRACT_VERSION, STATUS_CHANNEL } from '../shared/bootstrap-contracts';
import type { BootstrapResult } from '../shared/bootstrap-contracts';
import { parseResult, safeError } from '../shared/bootstrap-validation';

// Presentation only: this DOM marker grants no IPC or filesystem authority.
if (process.argv.includes('--gabprd-bootstrap-fixture-ui')) {
  window.addEventListener('DOMContentLoaded', () => {
    document.documentElement.dataset.bootstrapFixture = 'true';
    document.title = 'PRD Creator — Bootstrap';
    document.dispatchEvent(new Event('gabprd-bootstrap-fixture'));
  }, { once: true });
}

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
