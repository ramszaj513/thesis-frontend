import { BrowserWindow, dialog, ipcMain, type FileFilter, type IpcMainInvokeEvent, type OpenDialogOptions } from 'electron';
import { IpcChannel, type IpcResult } from '../../shared/ipc';
import { BACKEND_METHODS, type BackendErrorCode, type BackendMethodName, type MethodParams } from '../../shared/protocol';
import type { Backend } from '../backend/Backend';
import { BackendError } from '../backend/BackendError';

export function registerIpcHandlers(backend: Backend): void {
  ipcMain.handle(
    IpcChannel.BackendInvoke,
    async (_event: IpcMainInvokeEvent, method: unknown, params: unknown): Promise<IpcResult<unknown>> => {
      if (!isBackendMethod(method)) {
        return { ok: false, error: { code: 'unknownMethod', message: `Unknown backend method: ${String(method)}` } };
      }
      try {
        const value = await backend.request(method, (params ?? {}) as MethodParams<typeof method>);
        return { ok: true, value };
      } catch (error) {
        return { ok: false, error: toErrorObject(error) };
      }
    },
  );

  ipcMain.handle(IpcChannel.BackendGetStatus, () => backend.getStatus());

  ipcMain.handle(IpcChannel.DialogOpenScore, (event) =>
    showOpenDialog(event, 'Open MusicXML score', [
      { name: 'MusicXML', extensions: ['musicxml', 'xml'] },
      { name: 'All files', extensions: ['*'] },
    ]),
  );
  ipcMain.handle(IpcChannel.DialogOpenWav, (event) =>
    showOpenDialog(event, 'Open WAV recording', [
      { name: 'WAV audio', extensions: ['wav'] },
      { name: 'All files', extensions: ['*'] },
    ]),
  );
}

async function showOpenDialog(
  event: IpcMainInvokeEvent,
  title: string,
  filters: FileFilter[],
): Promise<string | null> {
  const window = BrowserWindow.fromWebContents(event.sender);
  const options: OpenDialogOptions = { title, filters, properties: ['openFile'] };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]!;
}

function isBackendMethod(method: unknown): method is BackendMethodName {
  return typeof method === 'string' && (BACKEND_METHODS as readonly string[]).includes(method);
}

function toErrorObject(error: unknown): { code: BackendErrorCode; message: string } {
  if (error instanceof BackendError) return { code: error.code, message: error.message };
  return { code: 'internal', message: error instanceof Error ? error.message : String(error) };
}
