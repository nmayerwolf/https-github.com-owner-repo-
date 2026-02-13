import { api } from '../api/apiClient';

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
};

export const notificationsSupported = () => {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
};

export const registerServiceWorker = async () => {
  if (!notificationsSupported()) return null;
  return navigator.serviceWorker.register('/sw.js');
};

export const subscribeBrowserPush = async () => {
  if (!notificationsSupported()) {
    return { ok: false, reason: 'UNSUPPORTED' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: 'DENIED' };
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    return { ok: false, reason: 'NO_REGISTRATION' };
  }

  const keyResponse = await api.getNotificationPublicKey();
  if (!keyResponse?.enabled || !keyResponse?.publicKey) {
    return { ok: false, reason: 'PUSH_DISABLED' };
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(keyResponse.publicKey)
  });

  await api.subscribeNotifications(subscription);

  return { ok: true };
};
