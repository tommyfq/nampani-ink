'use client';

import { FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

type LoginReply = { step: 'done' } | { step: 'code'; challenge: string; sentTo: string };

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Step 2: code from the email.
  const [challenge, setChallenge] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [trust, setTrust] = useState(true);
  const [wait, setWait] = useState(0);
  const [info, setInfo] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  function go() {
    const next = params.get('next');
    location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/admin';
  }

  function fail(err: unknown) {
    setError(err instanceof ApiError ? err.message : 'Could not reach the server');
    setBusy(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError('Enter your email and password');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await api<LoginReply>('/auth/login', { method: 'POST', body: { email, password } });
      if (r.step === 'done') return go();
      setChallenge(r.challenge);
      setSentTo(r.sentTo);
      setCode('');
      setWait(60);
      setInfo('');
      setBusy(false);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      fail(err);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from the email');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/auth/login/code', { method: 'POST', body: { challenge, code, trust } });
      go();
    } catch (err) {
      // Expired or too many tries: back to step 1.
      if (err instanceof ApiError && /expired|Log in again/.test(err.message)) {
        setChallenge('');
        setPassword('');
      }
      setCode('');
      fail(err);
    }
  }

  async function resend() {
    setError('');
    setInfo('');
    try {
      const r = await api<{ sentTo: string }>('/auth/login/resend', { method: 'POST', body: { challenge } });
      setSentTo(r.sentTo);
      setWait(60);
      setInfo('A new code is on its way. The old code no longer works.');
      codeRef.current?.focus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
    }
  }

  function back() {
    setChallenge('');
    setPassword('');
    setError('');
    setInfo('');
  }

  if (challenge) {
    return (
      <main className="login">
        <form className="card" onSubmit={submitCode} noValidate>
          <div className="brand">NAMPANI INK</div>
          <p className="muted small" style={{ textAlign: 'center' }}>Check your email</p>
          <p className="small" style={{ textAlign: 'center', margin: 0 }}>
            We sent a 6-digit code to <strong>{sentTo}</strong>. It works for 10 minutes.
          </p>
          <label className="f">
            Login code
            <input
              ref={codeRef}
              className="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
            />
          </label>
          <label className="f check">
            <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
            Trust this device for 30 days
          </label>
          {error && <p className="err" role="alert">{error}</p>}
          {info && !error && <p className="muted small" role="status">{info}</p>}
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Log in'}</button>
          <div className="login-links">
            <button type="button" className="link" onClick={back}>← Use another account</button>
            <button type="button" className="link" onClick={resend} disabled={wait > 0}>
              {wait > 0 ? `Send a new code (${wait}s)` : 'Send a new code'}
            </button>
          </div>
          <p className="muted small" style={{ margin: 0 }}>Untick &ldquo;Trust this device&rdquo; on a shared or public computer.</p>
        </form>
      </main>
    );
  }

  return (
    <main className="login">
      <form className="card" onSubmit={submit} noValidate>
        <div className="brand">NAMPANI INK</div>
        <p className="muted small" style={{ textAlign: 'center' }}>Staff login</p>
        <label className="f">
          Email
          <input type="email" autoComplete="username" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} />
        </label>
        <label className="f">
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} />
        </label>
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
