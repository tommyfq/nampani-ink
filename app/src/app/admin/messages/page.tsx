'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageItem, MessageRow } from '@/components/MessageRow';
import { useMe } from '@/components/Session';
import { api, ApiError } from '@/lib/api';

type Tab = 'todo' | 'upcoming' | 'sent';
const TABS: { id: Tab; label: string }[] = [
  { id: 'todo', label: 'To send' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'sent', label: 'Sent' },
];

export default function MessagesPage() {
  const me = useMe()!;
  const [outlets, setOutlets] = useState<{ id: string; name: string; timezone: string }[] | null>(null);
  const [outletId, setOutletId] = useState('');
  const [items, setItems] = useState<MessageItem[] | null>(null);
  const [tab, setTab] = useState<Tab>('todo');
  const [error, setError] = useState('');
  const [editTemplates, setEditTemplates] = useState(false);

  useEffect(() => {
    api<{ id: string; name: string; timezone: string }[]>('/admin/outlets').then((list) => {
      setOutlets(list);
      let saved: string | null = null;
      try {
        saved = localStorage.getItem('npi.outlet');
      } catch {
        /* private mode */
      }
      setOutletId(list.find((o) => o.id === saved)?.id ?? list[0]?.id ?? '');
    });
  }, []);

  const load = useCallback(async () => {
    if (!outletId) return;
    try {
      setItems(await api<MessageItem[]>(`/pos/messages?outletId=${outletId}`));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load messages');
    }
  }, [outletId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (me.role === 'ARTIST') return <p className="muted">You do not have access to this page.</p>;
  const tz = outlets?.find((o) => o.id === outletId)?.timezone ?? 'Asia/Makassar';
  const shown = items?.filter((i) => i.state === tab) ?? [];
  const count = (t: Tab) => items?.filter((i) => i.state === t).length ?? 0;

  return (
    <>
      <div className="head">
        <div>
          <h1>WhatsApp messages</h1>
          <p className="muted">Send each message by hand: open WhatsApp (the text is filled in), attach the receipt if there is one, send, then mark it as sent.</p>
        </div>
        <div className="row">
          {outlets && outlets.length > 1 && (
            <select value={outletId} onChange={(e) => setOutletId(e.target.value)} aria-label="Outlet" style={{ width: 'auto' }}>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          {me.role === 'OWNER' && <button className="btn line" onClick={() => setEditTemplates(true)}>Edit templates</button>}
        </div>
      </div>

      <div className="tabs" role="tablist" style={{ marginBottom: 14 }}>
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label} ({count(t.id)})
          </button>
        ))}
      </div>

      {error && <p className="err">{error}</p>}
      {!items ? (
        <p className="muted">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="card muted">
          {tab === 'todo' ? 'Nothing to send right now.' : tab === 'upcoming' ? 'No reminders coming up in the next 7 days.' : 'No messages sent in the last 14 days.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {shown.map((m) => <MessageRow key={m.key} m={m} tz={tz} onChanged={load} />)}
        </div>
      )}

      {editTemplates && <TemplateEditor onClose={() => { setEditTemplates(false); load(); }} />}
    </>
  );
}

const TEMPLATES: { key: string; label: string; when: string }[] = [
  { key: 'template.consultationReminder', label: 'Consultation reminder', when: '16 hours before a consultation' },
  { key: 'template.dpConfirmation', label: 'DP receipt + booking confirmed', when: 'after the DP is recorded (attach the receipt)' },
  { key: 'template.appointmentReminder', label: 'Appointment reminder', when: '16 hours before a tattoo' },
  { key: 'template.receipt', label: 'Final receipt', when: 'after the final payment (attach the receipt)' },
];
const FIELDS = '{nama} {studio} {outlet} {hari} {tanggal} {jam} {artist} {kode} {alamat} {maps} {jumlah} {total} {sisa} {kuitansi}';

function TemplateEditor({ onClose }: { onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    api<Record<string, unknown>>('/admin/settings').then((s) => setValues(Object.fromEntries(TEMPLATES.map((t) => [t.key, String(s[t.key] ?? '')]))));
  }, []);

  async function save(key: string) {
    if (!values?.[key].trim()) {
      setStatus((s) => ({ ...s, [key]: 'The message cannot be empty' }));
      return;
    }
    setStatus((s) => ({ ...s, [key]: 'Saving…' }));
    try {
      await api(`/admin/settings/${key}`, { method: 'PUT', body: { value: values[key] } });
      setStatus((s) => ({ ...s, [key]: 'Saved' }));
    } catch (e) {
      setStatus((s) => ({ ...s, [key]: e instanceof ApiError ? e.issues[0]?.message ?? e.message : 'Could not save' }));
    }
  }

  return (
    <div className="drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="head">
          <div>
            <h2 style={{ marginBottom: 2 }}>Message templates</h2>
            <p className="muted small">Bahasa Indonesia. Words in {'{ }'} are filled in automatically:</p>
            <p className="small" style={{ marginTop: 4 }}><code>{FIELDS}</code></p>
          </div>
          <button className="btn line" onClick={onClose}>Close</button>
        </div>
        {!values ? (
          <p className="muted">Loading…</p>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {TEMPLATES.map((t) => {
              const st = status[t.key];
              return (
                <section key={t.key} className="card">
                  <h2 style={{ marginBottom: 2 }}>{t.label}</h2>
                  <p className="muted small" style={{ marginBottom: 8 }}>Sent {t.when}.</p>
                  <textarea
                    value={values[t.key]}
                    rows={8}
                    onChange={(e) => {
                      setValues({ ...values, [t.key]: e.target.value });
                      setStatus((s) => ({ ...s, [t.key]: '' }));
                    }}
                  />
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="btn" onClick={() => save(t.key)}>Save</button>
                    {st && <span className={st === 'Saved' ? 'ok' : st === 'Saving…' ? 'small' : 'err'}>{st}</span>}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
