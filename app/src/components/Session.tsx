'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { api, Me } from '@/lib/api';

const SessionContext = createContext<Me | null>(null);
export const useMe = () => useContext(SessionContext);

/** Loads the logged-in user; the API helper redirects to /login when there is none. */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api<{ user: Me }>('/auth/me').then((r) => setMe(r.user)).catch(() => undefined);
  }, []);
  if (!me) return <main className="login"><p className="muted">Loading…</p></main>;
  return <SessionContext.Provider value={me}>{children}</SessionContext.Provider>;
}
