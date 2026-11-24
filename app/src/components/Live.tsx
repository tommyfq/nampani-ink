'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { refreshPush } from '@/lib/push';
import { useMe } from './Session';

interface LiveValue {
  /** Open website requests the user can see. */
  inboxCount: number;
  refreshCount: () => void;
  /** Bumps each time a new request arrives, so pages can reload. */
  requestTick: number;
  connected: boolean;
}

const LiveContext = createContext<LiveValue>({ inboxCount: 0, refreshCount: () => undefined, requestTick: 0, connected: false });
export const useLive = () => useContext(LiveContext);

/** Two soft notes, made in the browser (no sound file). Browsers only play it after the user has clicked the page once. */
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch {
    /* no audio */
  }
}

/**
 * Keeps the POS up to date: a live connection to the API (Server-Sent Events) that
 * plays a sound and updates the inbox counter when a website request arrives.
 * Falls back to checking every minute if the connection drops.
 */
export function LiveProvider({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const staff = me && me.role !== 'ARTIST';
  const [inboxCount, setInboxCount] = useState(0);
  const [requestTick, setRequestTick] = useState(0);
  const [connected, setConnected] = useState(false);
  const titleRef = useRef<string>('');

  const refreshCount = useCallback(() => {
    if (!staff) return;
    api<{ count: number }>('/pos/inbox/count').then((r) => setInboxCount(r.count)).catch(() => undefined);
  }, [staff]);

  useEffect(() => {
    if (!staff) return;
    refreshCount();
    refreshPush();
    const es = new EventSource('/api/pos/events');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener('request', () => {
      chime();
      setRequestTick((t) => t + 1);
      refreshCount();
    });
    const poll = setInterval(refreshCount, 60_000);
    return () => {
      es.close();
      clearInterval(poll);
    };
  }, [staff, refreshCount]);

  // "(2) Nampani Ink POS" in the browser tab while requests are waiting.
  useEffect(() => {
    if (!titleRef.current) titleRef.current = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = inboxCount > 0 ? `(${inboxCount}) ${titleRef.current}` : titleRef.current;
  }, [inboxCount]);

  return <LiveContext.Provider value={{ inboxCount, refreshCount, requestTick, connected }}>{children}</LiveContext.Provider>;
}
