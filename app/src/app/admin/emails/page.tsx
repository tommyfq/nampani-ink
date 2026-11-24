'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMe } from '@/components/Session';
import { api, ApiError } from '@/lib/api';

type EmailType = 'requestReceived' | 'studioAlert' | 'bookingConfirmed' | 'dpReceipt' | 'reminder' | 'finalReceipt';
interface Status {
  mode: 'smtp' | 'outbox' | 'off';
  from: string;
  studioTo: string;
  lastWeek: Record<string, number>;
  types: { type: EmailType; label: string; when: string; to: 'customer' | 'studio' }[];
  fields: string;
}
interface LogRow {
  id: string;
  type: string;
  to: string;
  subject: string;
  status: 'SENT' | 'FAILED' | 'SKIPPED' | 'RETRY';
  error: string;
  attempts: number;
  createdAt: string;
  booking: { id: string; code: string } | null;
}

const MODE_TEXT: Record<Status['mode'], { label: string; text: string; cls: string }> = {
  smtp: { label: 'Connected', text: 'Emails are sent through the studio mailbox.', cls: 'ok' },
  outbox: { label: 'Test mode', text: 'No mail server is set: emails are saved on this computer (api/mail-outbox) instead of being sent.', cls: 'later' },
  off: { label: 'Not set up', text: 'The studio mailbox is not connected yet, so no emails are sent. They are listed below as "Skipped".', cls: 'off' },
};
const TYPE_LABEL: Record<string, string> = {
  requestReceived: 'Request received',
  studioAlert: 'Studio alert',
  bookingConfirmed: 'Booking confirmed',
  dpReceipt: 'DP receipt',
  reminder: 'Reminder',
  finalReceipt: 'Final receipt',
  test: 'Test',
  loginCode: 'Staff login code',
};
const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export default function EmailsPage() {
  const me = useMe()!;
  const [status, setStatus] = useState<Status | null>(null);
  const [log, setLog] = useState<LogRow[] | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [editing, setEditing] = useState<EmailType | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([api<Status>('/admin/emails/status'), api<LogRow[]>('/admin/emails/log')]);
      setStatus(s);
      setLog(l);
      if (me.role === 'OWNER') setEnabled(Boolean((await api<Record<string, unknown>>('/admin/settings'))['email.enabled']));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load emails');
    }
  }, [me.role]);

  useEffect(() => {
    load();
  }, [load]);

  if (me.role !== 'OWNER' && me.role !== 'MANAGER') return <p className="muted">You do not have access to this page.</p>;
  if (error) return <p className="err">{error}</p>;
  if (!status || !log) return <p className="muted">Loading…</p>;
  const mode = MODE_TEXT[status.mode];

  return (
    <>
      <div className="head">
        <div>
          <h1>Emails</h1>
          <p className="muted">Automatic emails to customers in English, sent from {status.from}. Replies come back to the studio inbox.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row">
          <div>
            <strong>Mail server: </strong>
            <span className={`pill ${mode.cls}`}>{mode.label}</span>
            {enabled !== null && (
              <>
                {' '}
                <strong style={{ marginLeft: 10 }}>Sending: </strong>
                <span className={`pill ${enabled ? 'ok' : 'off'}`}>{enabled ? 'On' : 'Off'}</span>
              </>
            )}
            <div className="muted small" style={{ marginTop: 4 }}>
              {mode.text} {enabled === false && <>Emails are switched off in <Link href="/admin/settings">Settings</Link>.</>} New-request alerts go to {status.studioTo}.
            </div>
          </div>
          <span className="spacer" />
          <div className="small muted" style={{ textAlign: 'right' }}>
            Last 7 days: {status.lastWeek.SENT ?? 0} sent · {status.lastWeek.FAILED ?? 0} failed · {status.lastWeek.SKIPPED ?? 0} skipped
          </div>
        </div>
      </div>

      <h2>Emails and wording</h2>
      <table style={{ marginBottom: 22 }}>
        <thead>
          <tr><th>Email</th><th>Sent</th><th>To</th>{me.role === 'OWNER' && <th />}</tr>
        </thead>
        <tbody>
          {status.types.map((t) => (
            <tr key={t.type}>
              <td><strong>{t.label}</strong></td>
              <td className="muted">{t.when}</td>
              <td>{t.to === 'studio' ? 'Studio' : 'Customer'}</td>
              {me.role === 'OWNER' && <td style={{ textAlign: 'right' }}><button className="btn line" onClick={() => setEditing(t.type)}>Edit &amp; preview</button></td>}
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Recent emails</h2>
      {log.length === 0 ? (
        <div className="card muted">No emails yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr><th>When</th><th>Email</th><th>To</th><th>Booking</th><th>Status</th></tr>
            </thead>
            <tbody>
              {log.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmt(r.createdAt)}</td>
                  <td>{TYPE_LABEL[r.type] ?? r.type}<div className="muted small">{r.subject}</div></td>
                  <td style={{ overflowWrap: 'anywhere' }}>{r.to}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.booking?.code ?? '—'}</td>
                  <td>
                    <span className={`pill ${r.status === 'SENT' ? 'ok' : r.status === 'FAILED' ? 'off' : ''}`}>{r.status === 'SENT' ? 'Sent' : r.status === 'FAILED' ? `Failed (${r.attempts}×)` : r.status === 'SKIPPED' ? 'Skipped' : 'Retrying'}</span>
                    {r.error && <div className="muted small">{r.error}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <TemplateEditor type={editing} label={status.types.find((t) => t.type === editing)!.label} fields={status.fields} onClose={() => { setEditing(null); load(); }} />}
    </>
  );
}

function TemplateEditor({ type, label, fields, onClose }: { type: EmailType; label: string; fields: string; onClose: () => void }) {
  const me = useMe()!;
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [testTo, setTestTo] = useState(me.email);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    api<Record<string, { subject: string; body: string }>>('/admin/settings').then((s) => {
      const t = s[`emailTemplate.${type}`];
      setSubject(t?.subject ?? '');
      setBody(t?.body ?? '');
      setLoaded(true);
    });
  }, [type]);

  // Live preview while typing (waits half a second after the last key).
  useEffect(() => {
    if (!loaded || !subject.trim() || !body.trim()) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api<{ subject: string; html: string }>('/admin/emails/preview', { method: 'POST', body: { type, subject, body } }).then(setPreview).catch(() => undefined);
    }, 500);
    return () => clearTimeout(timer.current);
  }, [type, subject, body, loaded]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/admin/settings/emailTemplate.${type}`, { method: 'PUT', body: { value: { subject, body } } });
      setMsg({ text: 'Saved', ok: true });
    } catch (e) {
      setMsg({ text: e instanceof ApiError ? e.issues[0]?.message ?? e.message : 'Could not save', ok: false });
    }
    setBusy(false);
  }

  async function sendTest() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ status: string; error: string }>('/admin/emails/test', { method: 'POST', body: { type, subject, body, to: testTo } });
      setMsg(r.status === 'SENT' ? { text: `Test sent to ${testTo}`, ok: true } : { text: `Not sent: ${r.error || r.status}`, ok: false });
    } catch (e) {
      setMsg({ text: e instanceof ApiError ? e.issues[0]?.message ?? e.message : 'Could not send', ok: false });
    }
    setBusy(false);
  }

  return (
    <div className="drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer wide">
        <div className="head">
          <div>
            <h2 style={{ marginBottom: 2 }}>{label}</h2>
            <p className="muted small">Words in {'{ }'} are filled in automatically. The details box, buttons and footer are added for you.</p>
            <p className="small" style={{ marginTop: 4 }}><code>{fields}</code></p>
          </div>
          <button className="btn line" onClick={onClose}>Close</button>
        </div>
        {!loaded ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="email-edit">
            <div>
              <label className="small muted">Subject<input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} /></label>
              <label className="small muted" style={{ display: 'block', marginTop: 10 }}>Message<textarea rows={12} value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} /></label>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn" disabled={busy} onClick={save}>Save</button>
              </div>
              <div className="row" style={{ marginTop: 16, alignItems: 'flex-end' }}>
                <label className="small muted" style={{ flex: 1 }}>Send a test to<input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></label>
                <button className="btn line" disabled={busy || !testTo} onClick={sendTest}>Send test</button>
              </div>
              {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
            </div>
            <div>
              <div className="small muted" style={{ marginBottom: 6 }}>Preview with sample details{preview && <> · <strong>{preview.subject}</strong></>}</div>
              {preview ? <iframe title="Email preview" className="email-preview" srcDoc={preview.html} sandbox="" /> : <div className="card muted">Preparing preview…</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
