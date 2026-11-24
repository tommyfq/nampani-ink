'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError, Role } from '@/lib/api';

export interface Payment {
  id: string;
  receiptNo: string;
  kind: 'DP' | 'FINAL';
  subtotal: number;
  discount: number;
  amount: number;
  methodName: string;
  approvalCode: string;
  proofFile: string;
  paidAt: string;
  voidedAt: string | null;
  voidReason: string;
  receivedBy: { name: string } | null;
}
interface Method { id: string; name: string; type: string; feeBps: number; requiresCode: boolean; requiresProof: boolean }
interface Meta { methods: Method[]; dpBps: number; discountMaxBps: number }

const rp = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const digits = (s: string) => s.replace(/[^\d]/g, '');
const issue = (err: unknown) => (err instanceof ApiError ? err.issues[0]?.message ?? err.message : 'Could not save');

/** Payments of a tattoo booking: take the DP, take the final payment, receipts, void. */
export function PaymentPanel({
  booking,
  outletId,
  role,
  onChanged,
}: {
  booking: { id: string; status: string; quotedPrice: number | null; payments: Payment[] };
  outletId: string;
  role: Role;
  onChanged: () => void;
}) {
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => {
    api<Meta>(`/pos/meta?outletId=${outletId}`).then(setMeta).catch(() => undefined);
  }, [outletId]);

  const active = booking.payments.filter((p) => !p.voidedAt);
  const dp = active.find((p) => p.kind === 'DP');
  const final = active.find((p) => p.kind === 'FINAL');
  const canDp = !dp && ['BOOKED', 'CONFIRMED'].includes(booking.status);
  const canFinal = !final && booking.status === 'CHECKED_IN';
  const isManager = role === 'OWNER' || role === 'MANAGER';

  return (
    <section className="card" style={{ marginBottom: 14 }}>
      <h2>Payments</h2>
      {booking.payments.length === 0 && !canDp && !canFinal && <p className="muted small">No payments yet.</p>}
      {booking.payments.map((p) => (
        <PaymentLine key={p.id} p={p} canVoid={isManager && !p.voidedAt} onChanged={onChanged} />
      ))}
      {meta && canDp && <DpForm bookingId={booking.id} quoted={booking.quotedPrice} meta={meta} onSaved={onChanged} />}
      {meta && canFinal && <FinalForm bookingId={booking.id} quoted={booking.quotedPrice} dpPaid={dp?.amount ?? 0} meta={meta} role={role} onSaved={onChanged} />}
    </section>
  );
}

function PaymentLine({ p, canVoid, onChanged }: { p: Payment; canVoid: boolean; onChanged: () => void }) {
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  async function doVoid(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Add a short reason');
      return;
    }
    try {
      await api(`/pos/payments/${p.id}/void`, { method: 'POST', body: { reason: reason.trim() } });
      onChanged();
    } catch (err) {
      setError(issue(err));
    }
  }
  return (
    <div className="payline">
      <div className="row">
        <div>
          <strong style={p.voidedAt ? { textDecoration: 'line-through' } : undefined}>{p.kind === 'DP' ? 'DP' : 'Final payment'} · {rp(p.amount)}</strong>
          <div className="muted small">
            {p.receiptNo} · {p.methodName}{p.approvalCode && ` · code ${p.approvalCode}`}{p.discount > 0 && ` · discount ${rp(p.discount)}`} · {p.receivedBy?.name ?? ''}
          </div>
          {p.voidedAt && <div className="err small">Void: {p.voidReason}</div>}
          {p.proofFile && <a className="small" href={`/api/pos/files/proofs/${p.proofFile}`} target="_blank" rel="noopener">View proof photo</a>}
        </div>
        <span className="spacer" />
        <a className="btn line" href={`/api/pos/payments/${p.id}/receipt`} download>Receipt PDF</a>
        {canVoid && !voiding && <button className="btn danger" type="button" onClick={() => setVoiding(true)}>Void</button>}
      </div>
      {voiding && (
        <form className="row" style={{ marginTop: 8 }} onSubmit={doVoid}>
          <input value={reason} onChange={(e) => { setReason(e.target.value); setError(''); }} placeholder="Reason, e.g. entered twice" style={{ flex: 1 }} autoFocus />
          <button className="btn danger" type="submit">Confirm void</button>
          <button className="btn line" type="button" onClick={() => setVoiding(false)}>Back</button>
        </form>
      )}
      {error && <p className="err">{error}</p>}
    </div>
  );
}

/** Method select + approval code / proof photo, shared by both forms. */
function MethodFields({
  meta,
  methodId,
  setMethodId,
  code,
  setCode,
  proof,
  setProof,
  errors,
}: {
  meta: Meta;
  methodId: string;
  setMethodId: (v: string) => void;
  code: string;
  setCode: (v: string) => void;
  proof: string;
  setProof: (v: string) => void;
  errors: Record<string, string>;
}) {
  const m = meta.methods.find((x) => x.id === methodId);
  const [uploading, setUploading] = useState(false);
  const [upErr, setUpErr] = useState('');
  async function upload(file: File) {
    setUploading(true);
    setUpErr('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/pos/uploads/proof', { method: 'POST', body: fd, credentials: 'same-origin' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message ?? 'Upload failed');
      setProof(d.file);
    } catch (e) {
      setUpErr(e instanceof Error ? e.message : 'Upload failed');
    }
    setUploading(false);
  }
  return (
    <>
      <label className="f">
        Payment method
        <select value={methodId} onChange={(e) => { setMethodId(e.target.value); setProof(''); setCode(''); }}>
          <option value="">— choose —</option>
          {meta.methods.map((x) => <option key={x.id} value={x.id}>{x.name}{x.feeBps ? ` (fee ${x.feeBps / 100}%)` : ''}</option>)}
        </select>
        {errors.methodId && <span className="err">{errors.methodId}</span>}
      </label>
      {m?.requiresCode && (
        <label className="f">
          Approval code (card slip)
          <input value={code} onChange={(e) => setCode(e.target.value)} />
          {errors.approvalCode && <span className="err">{errors.approvalCode}</span>}
        </label>
      )}
      {m?.requiresProof && (
        <label className="f">
          Proof photo (transfer / QRIS)
          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          {uploading && <span className="small">Uploading…</span>}
          {proof && !uploading && <span className="ok">Photo uploaded</span>}
          {(upErr || errors.proofFile) && <span className="err">{upErr || errors.proofFile}</span>}
        </label>
      )}
    </>
  );
}

function DpForm({ bookingId, quoted, meta, onSaved }: { bookingId: string; quoted: number | null; meta: Meta; onSaved: () => void }) {
  const expected = quoted ? Math.ceil((quoted * meta.dpBps) / 10000) : 0;
  const [price, setPrice] = useState(quoted ? String(quoted) : '');
  const [amount, setAmount] = useState(expected ? String(expected) : '');
  const [methodId, setMethodId] = useState('');
  const [code, setCode] = useState('');
  const [proof, setProof] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function onPrice(v: string) {
    setPrice(v);
    const n = Number(digits(v));
    setAmount(n ? String(Math.ceil((n * meta.dpBps) / 10000)) : '');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!Number(digits(price))) errs.price = 'Enter the quoted price';
    if (!Number(digits(amount))) errs.amount = 'Enter the DP amount';
    if (!methodId) errs.methodId = 'Choose a payment method';
    if (Object.keys(errs).length) return setErrors(errs);
    setBusy(true);
    try {
      if (Number(digits(price)) !== quoted) await api(`/pos/bookings/${bookingId}`, { method: 'PATCH', body: { quotedPrice: Number(digits(price)) } });
      await api(`/pos/bookings/${bookingId}/dp`, { method: 'POST', body: { methodId, amount: Number(digits(amount)), approvalCode: code || undefined, proofFile: proof || undefined } });
      onSaved();
    } catch (err) {
      const m = err instanceof ApiError && err.issues[0];
      setErrors(m ? { [m.path]: m.message, form: m.message } : { form: issue(err) });
      setBusy(false);
    }
  }

  return (
    <form className="payform" onSubmit={submit} noValidate>
      <h3>Take DP ({meta.dpBps / 100}%)</h3>
      <div className="form">
        <label className="f">Quoted price (Rp)<input value={price} inputMode="numeric" onChange={(e) => onPrice(e.target.value)} />{errors.price && <span className="err">{errors.price}</span>}</label>
        <label className="f">DP amount (Rp)<input value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value)} /><span className="small">{meta.dpBps / 100}% of the price, rounded up</span>{errors.amount && <span className="err">{errors.amount}</span>}</label>
        <MethodFields {...{ meta, methodId, setMethodId, code, setCode, proof, setProof, errors }} />
      </div>
      {errors.form && <p className="err" role="alert">{errors.form}</p>}
      <button className="btn" type="submit" disabled={busy} style={{ marginTop: 10 }}>{busy ? 'Saving…' : `Record DP ${amount ? rp(Number(digits(amount))) : ''}`}</button>
    </form>
  );
}

function FinalForm({ bookingId, quoted, dpPaid, meta, role, onSaved }: { bookingId: string; quoted: number | null; dpPaid: number; meta: Meta; role: Role; onSaved: () => void }) {
  const [price, setPrice] = useState(quoted ? String(quoted) : '');
  const [disc, setDisc] = useState('0');
  const [pin, setPin] = useState('');
  const [methodId, setMethodId] = useState('');
  const [code, setCode] = useState('');
  const [proof, setProof] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const subtotal = Number(digits(price)) || 0;
  const bps = Math.round((Number(disc.replace(',', '.')) || 0) * 100);
  const discount = Math.floor((subtotal * bps + 5000) / 10000);
  const due = subtotal - discount - dpPaid;
  const needsPin = bps > 0 && role === 'FRONT_DESK';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!subtotal) errs.subtotal = 'Enter the final price';
    if (bps < 0 || bps > meta.discountMaxBps) errs.discountBps = `Discount can be at most ${meta.discountMaxBps / 100}%`;
    if (needsPin && !/^\d{4,8}$/.test(pin)) errs.managerPin = 'Manager or owner PIN needed for a discount';
    if (due < 0) errs.subtotal = 'The DP is more than the price after discount';
    if (!methodId) errs.methodId = 'Choose a payment method';
    if (Object.keys(errs).length) return setErrors(errs);
    setBusy(true);
    try {
      await api(`/pos/bookings/${bookingId}/final`, {
        method: 'POST',
        body: { methodId, subtotal, discountBps: bps, managerPin: needsPin ? pin : undefined, approvalCode: code || undefined, proofFile: proof || undefined },
      });
      onSaved();
    } catch (err) {
      const m = err instanceof ApiError && err.issues[0];
      setErrors(m ? { [m.path]: m.message, form: m.message } : { form: issue(err) });
      setBusy(false);
    }
  }

  return (
    <form className="payform" onSubmit={submit} noValidate>
      <h3>Final payment</h3>
      <div className="form">
        <label className="f">Final price (Rp)<input value={price} inputMode="numeric" onChange={(e) => setPrice(e.target.value)} />{errors.subtotal && <span className="err">{errors.subtotal}</span>}</label>
        <label className="f">Discount %<input value={disc} inputMode="decimal" onChange={(e) => setDisc(e.target.value)} /><span className="small">Maximum {meta.discountMaxBps / 100}%</span>{errors.discountBps && <span className="err">{errors.discountBps}</span>}</label>
        {needsPin && (
          <label className="f">Manager / owner PIN<input type="password" value={pin} inputMode="numeric" autoComplete="off" onChange={(e) => setPin(e.target.value)} />{errors.managerPin && <span className="err">{errors.managerPin}</span>}</label>
        )}
        <MethodFields {...{ meta, methodId, setMethodId, code, setCode, proof, setProof, errors }} />
      </div>
      <table className="sum">
        <tbody>
          <tr><td>Price</td><td>{rp(subtotal)}</td></tr>
          {discount > 0 && <tr><td>Discount</td><td>- {rp(discount)}</td></tr>}
          {dpPaid > 0 && <tr><td>DP paid</td><td>- {rp(dpPaid)}</td></tr>}
          <tr className="tot"><td>To pay now</td><td>{rp(Math.max(due, 0))}</td></tr>
        </tbody>
      </table>
      {errors.form && <p className="err" role="alert">{errors.form}</p>}
      <button className="btn" type="submit" disabled={busy} style={{ marginTop: 10 }}>{busy ? 'Saving…' : `Record payment ${rp(Math.max(due, 0))}`}</button>
    </form>
  );
}
