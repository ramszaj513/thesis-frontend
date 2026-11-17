import { app, BrowserWindow } from 'electron';
import { IpcChannel } from '../shared/ipc';
import type { Backend } from './backend/Backend';
import { DemoBackend } from './demo/DemoBackend';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { createMainWindow } from './window/createMainWindow';

let backend: Backend | null = null;
let isQuitting = false;

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

async function bootstrap(): Promise<void> {
  backend = new DemoBackend();

  backend.onEvent((event) => broadcast(IpcChannel.BackendEvent, event));

  registerIpcHandlers(backend);
  createMainWindow();

  await backend.start();
}

app
  .whenReady()
  .then(bootstrap)
  .catch((error: unknown) => {
    console.error('[main] fatal error during startup', error);
    app.quit();
  });

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (isQuitting || !backend) return;
  event.preventDefault();
  isQuitting = true;
  backend
    .shutdown()
    .catch((error: unknown) => console.error('[main] error while shutting down backend', error))
    .finally(() => app.quit());
});
