'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';

export interface MessageItem {
  key: string;
  type: 'consultationReminder' | 'dpConfirmation' | 'appointmentReminder' | 'receipt';
  label: string;
  state: 'todo' | 'upcoming' | 'sent';
  dueAt: string;
  bookingId: string;
  bookingCode: string;
  paymentId: string | null;
  customer: { name: string; phone: string };
  artist: string;
  startsAt: string | null;
  text: string;
  waUrl: string;
  receiptPath: string | null;
  sentAt: string | null;
  sentBy: string | null;
}

const fmt = (iso: string, tz: string) =>
  new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz });

/**
 * One WhatsApp message to send by hand: preview, "Open WhatsApp" (text filled in),
 * "Download receipt" for payment messages, then "Mark as sent".
 */
export function MessageRow({ m, tz, onChanged, compact }: { m: MessageItem; tz: string; onChanged: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const overdue = m.state === 'todo' && m.startsAt && new Date(m.startsAt) < new Date(Date.now() + 2 * 3600_000);

  async function mark(sent: boolean) {
    setBusy(true);
    setError('');
    try {
      if (sent) await api('/pos/messages/sent', { method: 'POST', body: { type: m.type, bookingId: m.bookingId, paymentId: m.paymentId } });
      else await api(`/pos/messages/sent/${encodeURIComponent(m.key)}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save');
    }
    setBusy(false);
  }

  return (
    <div className={`msg ${m.state}`}>
      <div className="row">
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <strong>{m.label}</strong>
            <span className={`pill ${m.state === 'sent' ? '' : m.state === 'todo' ? 'due' : 'later'}`}>
              {m.state === 'sent' ? 'Sent' : m.state === 'todo' ? (overdue ? 'Overdue' : 'To send') : `From ${fmt(m.dueAt, tz)}`}
            </span>
          </div>
          {!compact && (
            <div className="muted small">
              {m.customer.name} · +{m.customer.phone} · {m.bookingCode}
              {m.startsAt && ` · ${fmt(m.startsAt, tz)}`} · {m.artist}
            </div>
          )}
          {m.state === 'sent' && <div className="ok small">Sent by {m.sentBy ?? 'staff'} · {m.sentAt && fmt(m.sentAt, tz)}</div>}
        </div>
        <span className="spacer" />
        <button className="btn line" type="button" onClick={() => setOpen((o) => !o)}>{open ? 'Hide text' : 'Show text'}</button>
      </div>

      {open && <pre className="msgtext">{m.text}</pre>}

      <div className="row" style={{ marginTop: 8 }}>
        {m.receiptPath && (
          <a className="btn line" href={m.receiptPath} download>
            1. Download receipt (PDF)
          </a>
        )}
        <a className="btn" href={m.waUrl} target="_blank" rel="noopener noreferrer">
          {m.receiptPath ? '2. Open WhatsApp' : 'Open WhatsApp'}
        </a>
        {m.state === 'sent' ? (
          <button className="btn line" type="button" disabled={busy} onClick={() => mark(false)}>Undo sent</button>
        ) : (
          <button className="btn line" type="button" disabled={busy} onClick={() => mark(true)}>{m.receiptPath ? '3. Mark as sent' : 'Mark as sent'}</button>
        )}
      </div>
      {m.receiptPath && m.state !== 'sent' && <p className="muted small" style={{ marginTop: 6 }}>Attach the downloaded PDF in the WhatsApp chat before sending.</p>}
      {error && <p className="err">{error}</p>}
    </div>
  );
}
