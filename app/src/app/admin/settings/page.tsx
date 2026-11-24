'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, bpsToPercent, percentToBps } from '@/lib/api';

type Kind = 'percent' | 'number' | 'time' | 'bool';
const GROUPS: { title: string; intro?: string; items: { key: string; label: string; kind: Kind; help?: string; dependsOn?: string; main?: boolean }[] }[] = [
  {
    title: 'Payments',
    items: [
      { key: 'dp.percentBps', label: 'Down payment (DP) %', kind: 'percent', help: 'Of the quoted price; rounded up to a whole Rupiah' },
      { key: 'discount.maxBps', label: 'Maximum discount in POS %', kind: 'percent', help: 'Only managers and owners can give discounts' },
    ],
  },
  {
    title: 'Bookings',
    items: [
      { key: 'booking.autoCancelHours', label: 'Cancel a booking after a no-show (hours)', kind: 'number' },
      { key: 'reminder.hoursBefore', label: 'Send reminders this many hours before', kind: 'number' },
      { key: 'reminder.windowStart', label: 'Earliest time to send', kind: 'time' },
      { key: 'reminder.windowEnd', label: 'Latest time to send', kind: 'time' },
    ],
  },
  {
    title: 'WhatsApp messages',
    intro: 'Only owners can change these. When a main switch is off, nothing is sent through that number.',
    items: [
      { key: 'whatsapp.customerEnabled', label: 'Send WhatsApp messages to customers (Nampani Ink number, Convia)', kind: 'bool', main: true },
      { key: 'whatsapp.consultationReminder', label: 'Consultation reminder (with Confirm button)', kind: 'bool', dependsOn: 'whatsapp.customerEnabled' },
      { key: 'whatsapp.dpConfirmation', label: 'DP receipt + booking confirmation', kind: 'bool', dependsOn: 'whatsapp.customerEnabled' },
      { key: 'whatsapp.appointmentReminder', label: 'Appointment reminder (with Confirm button)', kind: 'bool', dependsOn: 'whatsapp.customerEnabled' },
      { key: 'whatsapp.receipt', label: 'Final receipt', kind: 'bool', dependsOn: 'whatsapp.customerEnabled' },
      { key: 'whatsapp.internalEnabled', label: 'Send WhatsApp messages to artists (internal number)', kind: 'bool', main: true },
    ],
  },
  {
    title: 'Investor',
    items: [{ key: 'investor.payoutPeriodDays', label: 'Investor payout period (days)', kind: 'number' }],
  },
];

function toInput(kind: Kind, v: unknown) {
  if (kind === 'percent') return bpsToPercent(v as number);
  if (kind === 'bool') return Boolean(v);
  return String(v ?? '');
}
function fromInput(kind: Kind, v: unknown) {
  if (kind === 'percent') return percentToBps(String(v));
  if (kind === 'number') return Number(v);
  return v;
}

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    api<Record<string, unknown>>('/admin/settings').then((s) => {
      const v: Record<string, unknown> = {};
      for (const g of GROUPS) for (const i of g.items) v[i.key] = toInput(i.kind, s[i.key]);
      setValues(v);
    });
  }, []);

  async function save(key: string, kind: Kind, value: unknown) {
    setStatus((s) => ({ ...s, [key]: 'Saving…' }));
    try {
      await api(`/admin/settings/${key}`, { method: 'PUT', body: { value: fromInput(kind, value) } });
      setStatus((s) => ({ ...s, [key]: 'Saved' }));
    } catch (err) {
      setStatus((s) => ({ ...s, [key]: err instanceof ApiError ? err.issues[0]?.message ?? err.message : 'Could not save' }));
    }
  }

  if (!values) return <p className="muted">Loading…</p>;
  return (
    <>
      <div className="head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Changes save immediately and apply to new bookings and transactions.</p>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 16 }}>
        {GROUPS.map((g) => (
          <section key={g.title} className="card">
            <h2 style={g.intro ? { marginBottom: 2 } : undefined}>{g.title}</h2>
            {g.intro && <p className="muted small" style={{ marginBottom: 12 }}>{g.intro}</p>}
            <div className="form">
              {g.items.map((i) => {
                const st = status[i.key];
                const note = st ? <span className={st === 'Saved' ? 'ok' : st === 'Saving…' ? 'small' : 'err'}>{st}</span> : i.help ? <span className="small">{i.help}</span> : null;
                if (i.kind === 'bool') {
                  const blocked = i.dependsOn ? !values[i.dependsOn] : false;
                  return (
                    <label
                      key={i.key}
                      className="f check full"
                      style={{ ...(i.dependsOn ? { paddingLeft: 26 } : {}), ...(i.main ? { fontWeight: 500, marginTop: 6 } : {}), ...(blocked ? { opacity: 0.45 } : {}) }}
                      title={blocked ? 'Turn on customer messages first' : undefined}
                    >
                      <input
                        type="checkbox"
                        disabled={blocked}
                        checked={Boolean(values[i.key])}
                        onChange={(e) => {
                          setValues({ ...values, [i.key]: e.target.checked });
                          save(i.key, i.kind, e.target.checked);
                        }}
                      />
                      {i.label} {note}
                    </label>
                  );
                }
                return (
                  <label key={i.key} className="f">
                    {i.label}
                    <input
                      value={String(values[i.key])}
                      inputMode={i.kind === 'time' ? 'numeric' : 'decimal'}
                      placeholder={i.kind === 'time' ? 'HH:MM' : undefined}
                      onChange={(e) => {
                        setValues({ ...values, [i.key]: e.target.value });
                        setStatus((s) => ({ ...s, [i.key]: '' }));
                      }}
                      onBlur={(e) => save(i.key, i.kind, e.target.value)}
                    />
                    {note}
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
