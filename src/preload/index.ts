import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { IpcChannel, type BackendEvent, type WindowApi } from "../shared/ipc";

function invokeBackend(method: string, params: unknown = {}) {
  return ipcRenderer.invoke(IpcChannel.BackendInvoke, method, params);
}

const api: WindowApi = {
  score: {
    load: (path) => invokeBackend("score.load", { path }),
  },
  audio: {
    listDevices: () => invokeBackend("audio.listDevices"),
  },
  session: {
    start: (params) => invokeBackend("session.start", params),
    stop: (sessionId) => invokeBackend("session.stop", { sessionId }),
    getState: () => invokeBackend("session.getState"),
  },
  dialogs: {
    openScoreFile: () => ipcRenderer.invoke(IpcChannel.DialogOpenScore),
    openWavFile: () => ipcRenderer.invoke(IpcChannel.DialogOpenWav),
  },
  backend: {
    getStatus: () => ipcRenderer.invoke(IpcChannel.BackendGetStatus),
    onEvent: (listener) => {
      const wrapped = (_event: IpcRendererEvent, payload: BackendEvent) =>
        listener(payload);
      ipcRenderer.on(IpcChannel.BackendEvent, wrapped);
      return () => ipcRenderer.removeListener(IpcChannel.BackendEvent, wrapped);
    },
  },
};

contextBridge.exposeInMainWorld("api", api);
