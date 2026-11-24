'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, bpsToPercent, percentToBps } from '@/lib/api';

type Kind = 'TATTOO' | 'FORFEITED_DP' | 'PRODUCT';
interface Line {
  key: string;
  label: string;
  bps: number;
  group: string;
  isArtist: boolean;
  takesFees: boolean;
  takesRemainder: boolean;
}
interface Scheme {
  id: string;
  kind: Kind;
  name: string;
  effectiveFrom: string;
  lines: Line[];
}

const KINDS: { kind: Kind; title: string; text: string }[] = [
  { kind: 'TATTOO', title: 'Tattoo services', text: 'Split of every paid tattoo, after discount.' },
  { kind: 'FORFEITED_DP', title: 'Forfeited DP', text: 'When a customer cancels or does not show up.' },
  { kind: 'PRODUCT', title: 'Product sales', text: 'Aftercare and merchandise. Not decided yet.' },
];

const blankLine = (): Line => ({ key: '', label: '', bps: 0, group: '', isArtist: false, takesFees: false, takesRemainder: false });

export default function RevenuePage() {
  const [data, setData] = useState<{ current: Partial<Record<Kind, Scheme>>; history: Scheme[] } | null>(null);
  const [editing, setEditing] = useState<Kind | null>(null);
  const load = useCallback(() => api<typeof data>('/admin/revenue-schemes').then(setData), []);
  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <p className="muted">Loading…</p>;
  return (
    <>
      <div className="head">
        <div>
          <h1>Revenue sharing</h1>
          <p className="muted">
            Each transaction saves the split in force when it is paid. Changing a split only affects new transactions.
          </p>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 16 }}>
        {KINDS.map(({ kind, title, text }) => {
          const s = data.current[kind];
          return (
            <section key={kind} className="card">
              <div className="row">
                <div>
                  <h2 style={{ marginBottom: 2 }}>{title}</h2>
                  <p className="muted small">
                    {text} {s && `In force since ${new Date(s.effectiveFrom).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`}
                  </p>
                </div>
                <span className="spacer" />
                <button className="btn line" onClick={() => setEditing(kind)}>{s ? 'Change split' : 'Set split'}</button>
              </div>
              {s ? (
                <table style={{ marginTop: 12 }}>
                  <thead>
                    <tr><th>Share</th><th>%</th><th>Notes</th></tr>
                  </thead>
                  <tbody>
                    {s.lines.map((l) => (
                      <tr key={l.key}>
                        <td>{l.label}</td>
                        <td>{l.bps / 100}%</td>
                        <td className="muted small">
                          {[l.isArtist && 'artist', l.group && `${l.group} group`, l.takesFees && 'pays card/QRIS fees', l.takesRemainder && 'gets rounding remainder'].filter(Boolean).join(' · ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted" style={{ marginTop: 10 }}>No split set. Products are recorded and can be split once this is set.</p>
              )}
            </section>
          );
        })}
      </div>
      {editing && (
        <SchemeEditor
          kind={editing}
          current={data.current[editing]}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

function SchemeEditor({ kind, current, onClose, onSaved }: { kind: Kind; current?: Scheme; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(current?.name ?? KINDS.find((k) => k.kind === kind)!.title);
  const [lines, setLines] = useState<(Line & { pct: string })[]>(
    (current?.lines ?? [blankLine()]).map((l) => ({ ...l, pct: bpsToPercent(l.bps) })),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const total = lines.reduce((s, l) => s + (Number(l.pct) || 0), 0);

  function update(i: number, patch: Partial<Line & { pct: string }>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    setError('');
  }

  async function save() {
    if (lines.some((l) => !l.label.trim() || l.pct === '' || Number.isNaN(Number(l.pct)))) {
      setError('Every share needs a name and a percentage');
      return;
    }
    if (Math.round(total * 100) !== 10000) {
      setError(`Shares must add up to 100% (now ${Math.round(total * 100) / 100}%)`);
      return;
    }
    setBusy(true);
    try {
      await api('/admin/revenue-schemes', {
        method: 'POST',
        body: {
          kind,
          name,
          lines: lines.map(({ pct, ...l }) => ({
            ...l,
            key: l.key || l.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'share',
            bps: percentToBps(pct),
          })),
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.issues[0]?.message ?? err.message : 'Could not save');
      setBusy(false);
    }
  }

  return (
    <div className="drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="head">
          <h2>Change split</h2>
          <button className="btn line" onClick={onClose}>Close</button>
        </div>
        <p className="muted small" style={{ marginBottom: 14 }}>Saving creates a new version for new transactions. Past transactions keep their split.</p>
        <label className="f" style={{ marginBottom: 14 }}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <table>
          <thead>
            <tr><th>Share</th><th style={{ width: 90 }}>%</th><th>Options</th><th /></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td><input value={l.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="e.g. Marketing" /></td>
                <td><input value={l.pct} inputMode="decimal" onChange={(e) => update(i, { pct: e.target.value })} /></td>
                <td className="small">
                  <label className="row"><input type="checkbox" checked={l.isArtist} onChange={(e) => update(i, { isArtist: e.target.checked })} /> Artist</label>
                  <label className="row"><input type="checkbox" checked={l.takesFees} onChange={(e) => update(i, { takesFees: e.target.checked })} /> Pays payment fees</label>
                  <label className="row"><input type="checkbox" checked={l.takesRemainder} onChange={(e) => update(i, { takesRemainder: e.target.checked })} /> Gets rounding remainder</label>
                  <label className="row"><input type="checkbox" checked={l.group === 'management'} onChange={(e) => update(i, { group: e.target.checked ? 'management' : '' })} /> Management group</label>
                </td>
                <td><button type="button" className="btn danger" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Remove share">×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" className="btn line" onClick={() => setLines((ls) => [...ls, { ...blankLine(), pct: '' }])}>Add share</button>
          <span className="spacer" />
          <strong className={Math.round(total * 100) === 10000 ? 'ok' : 'err'}>Total {Math.round(total * 100) / 100}%</strong>
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>
          Management group: when the artist is one of the managers (e.g. Tutut), their management share goes to the other managers.
        </p>
        {error && <p className="err" style={{ marginTop: 10 }} role="alert">{error}</p>}
        <button className="btn" style={{ marginTop: 16 }} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save new version'}</button>
      </div>
    </div>
  );
}
