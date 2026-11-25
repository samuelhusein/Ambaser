// Runs in web pages and exposes nothing to them. Electron can only answer "allowed or not", so a site
// that has never asked about notifications would read "denied" and never ask. This reports "default".
import { contextBridge, ipcRenderer } from 'electron';

if (ipcRenderer.sendSync('permission:notifications') === 'default') {
  contextBridge.executeInMainWorld({
    func: () => {
      let state: NotificationPermission = 'default';
      const request = Notification.requestPermission.bind(Notification);
      Object.defineProperty(Notification, 'permission', { configurable: true, get: () => state });
      Notification.requestPermission = async (callback?: NotificationPermissionCallback) => {
        state = await request();
        callback?.(state);
        return state;
      };
    },
  });
}
