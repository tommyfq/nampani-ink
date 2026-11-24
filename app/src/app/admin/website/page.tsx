'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';

type Studio = Record<string, any>;

const FIELDS: { key: string; label: string; area?: boolean }[] = [
  { key: 'name', label: 'Studio name' },
  { key: 'tagline', label: 'Tagline' },
  { key: 'city', label: 'City' },
  { key: 'email', label: 'Email' },
  { key: 'whatsapp', label: 'Main WhatsApp (digits only)' },
  { key: 'priceFrom', label: 'Price from' },
  { key: 'priceRange', label: 'Price range' },
  { key: 'hoursNote', label: 'Hours note' },
  { key: 'description', label: 'Description (search engines and sharing)', area: true },
];

export default function WebsitePage() {
  const [studio, setStudio] = useState<Studio | null>(null);
  const [prep, setPrep] = useState<{ title: string; text: string }[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Record<string, any>>('/admin/site').then((s) => {
      setStudio(s.studio ?? {});
      setPrep(s.prep ?? []);
    });
  }, []);

  async function save() {
    if (!studio?.name?.trim()) {
      setMsg('Studio name is required');
      return;
    }
    if (studio.whatsapp && !/^\d{8,16}$/.test(studio.whatsapp)) {
      setMsg('WhatsApp must be digits only, e.g. 6281234567890');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      await api('/admin/site/studio', { method: 'PUT', body: { value: studio } });
      await api('/admin/site/prep', { method: 'PUT', body: { value: prep.filter((p) => p.title.trim()) } });
      setMsg('Saved. The website updates within a minute.');
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Could not save');
    }
    setBusy(false);
  }

  if (!studio) return <p className="muted">Loading…</p>;
  return (
    <>
      <div className="head">
        <div>
          <h1>Studio details</h1>
          <p className="muted">Shown across the website, in search results and when links are shared.</p>
        </div>
        <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      {msg && <p className={msg.startsWith('Saved') ? 'ok' : 'err'} style={{ marginBottom: 12 }} role="status">{msg}</p>}
      <section className="card" style={{ marginBottom: 16 }}>
        <h2>Studio</h2>
        <div className="form">
          {FIELDS.map((f) => (
            <label key={f.key} className={`f${f.area ? ' full' : ''}`}>
              {f.label}
              {f.area ? (
                <textarea value={studio[f.key] ?? ''} onChange={(e) => setStudio({ ...studio, [f.key]: e.target.value })} />
              ) : (
                <input value={studio[f.key] ?? ''} onChange={(e) => setStudio({ ...studio, [f.key]: e.target.value })} />
              )}
            </label>
          ))}
          <label className="f">
            Instagram link
            <input value={studio.social?.instagram ?? ''} onChange={(e) => setStudio({ ...studio, social: { ...studio.social, instagram: e.target.value } })} />
          </label>
          <label className="f">
            Nearby areas (comma-separated)
            <input value={(studio.nearbyAreas ?? []).join(', ')} onChange={(e) => setStudio({ ...studio, nearbyAreas: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          </label>
        </div>
      </section>
      <section className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Prepare for your session</h2>
          <span className="spacer" />
          <button className="btn line" onClick={() => setPrep([...prep, { title: '', text: '' }])}>Add tip</button>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {prep.map((p, i) => (
            <div key={i} className="form">
              <label className="f">
                Title
                <input value={p.title} onChange={(e) => setPrep(prep.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              </label>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <label className="f" style={{ flex: 1 }}>
                  Text
                  <input value={p.text} onChange={(e) => setPrep(prep.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                </label>
                <button className="btn danger" onClick={() => setPrep(prep.filter((_, j) => j !== i))} aria-label="Remove tip">×</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
