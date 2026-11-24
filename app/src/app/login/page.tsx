'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError('Enter your email and password');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/auth/login', { method: 'POST', body: { email, password } });
      const next = params.get('next');
      location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/admin';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
      setBusy(false);
    }
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
