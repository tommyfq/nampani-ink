'use client';

import { api } from './api';

export type PushState = 'unsupported' | 'ios-home-screen' | 'unavailable' | 'denied' | 'off' | 'on';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function keyBytes(base64url: string) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/** Whether this device gets notifications, and if not, why. */
export async function pushState(): Promise<PushState> {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIos() && !isStandalone() ? 'ios-home-screen' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Asks the browser for permission and registers this device with the API. */
export async function enablePush(): Promise<PushState> {
  const { publicKey } = await api<{ publicKey: string | null }>('/pos/push/key');
  if (!publicKey) return 'unavailable';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  const json = sub.toJSON();
  await api('/pos/push/subscribe', { method: 'POST', body: { endpoint: json.endpoint, keys: json.keys } });
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api(`/pos/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE' }).catch(() => undefined);
    await sub.unsubscribe();
  }
  return 'off';
}

/** Re-sends an existing subscription (keeps it attached to whoever is logged in on this device). */
export async function refreshPush() {
  if ((await pushState()) !== 'on') return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const json = (await reg?.pushManager.getSubscription())?.toJSON();
  if (json?.endpoint) await api('/pos/push/subscribe', { method: 'POST', body: { endpoint: json.endpoint, keys: json.keys } }).catch(() => undefined);
}
