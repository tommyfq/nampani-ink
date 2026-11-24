'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, bpsToPercent, percentToBps } from '@/lib/api';
import type { Field, Resource } from '@/lib/resources';
import { useMe } from './Session';

type Row = Record<string, any> & { id: string };
type Choices = Record<string, { value: string; label: string }[]>;

function initialValue(field: Field, row: Row | null): unknown {
  if (field.type === 'password' || field.type === 'pin') return '';
  const raw = row ? (field.read ? field.read(row) : row[field.key]) : undefined;
  if (field.type === 'bool') return raw ?? true;
  if (field.type === 'refs') return raw ?? [];
  if (field.type === 'percent') return bpsToPercent(raw as number | undefined);
  if (field.type === 'number') return raw == null ? '' : String(raw);
  return raw ?? '';
}

/** Form values → API body (types converted, empty optional values dropped). */
function toBody(fields: Field[], values: Record<string, unknown>, isNew: boolean) {
  const body: Record<string, unknown> = {};
  for (const f of fields) {
    if ((isNew && f.editOnly) || (!isNew && f.createOnly)) continue;
    const v = values[f.key];
    switch (f.type) {
      case 'password':
      case 'pin':
        if (v) body[f.key] = v;
        break;
      case 'number':
        if (v !== '' && v != null) body[f.key] = Number(v);
        else if (f.key === 'lat' || f.key === 'lng') body[f.key] = null;
        break;
      case 'percent':
        if (v !== '' && v != null) body[f.key] = percentToBps(String(v));
        break;
      case 'ref':
        body[f.key] = v ? v : null;
        break;
      default:
        body[f.key] = v;
    }
  }
  return body;
}

export function ResourcePage({ resource }: { resource: Resource }) {
  const me = useMe()!;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [choices, setChoices] = useState<Choices>({});
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [loadError, setLoadError] = useState('');

  const refFields = useMemo(() => resource.fields.filter((f) => f.ref), [resource]);

  const load = useCallback(async () => {
    try {
      setRows(await api<Row[]>(resource.path));
      const loaded: Choices = {};
      await Promise.all(
        refFields.map(async (f) => {
          const list = await api<any[]>(f.ref!.path).catch(() => []);
          loaded[f.key] = list.map((x) => ({ value: x.id, label: f.ref!.label(x) }));
        }),
      );
      setChoices(loaded);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load');
    }
  }, [resource, refFields]);

  useEffect(() => {
    load();
  }, [load]);

  const lookups = useMemo(() => {
    const m: Record<string, Map<string, string>> = {};
    for (const [key, list] of Object.entries(choices)) m[key] = new Map(list.map((c) => [c.value, c.label.replace(/ \(.*\)$/, '')]));
    return m;
  }, [choices]);

  if (!resource.roles.includes(me.role)) return <p className="muted">You do not have access to this page.</p>;

  return (
    <>
      <div className="head">
        <div>
          <h1>{resource.title}</h1>
          {resource.intro && <p className="muted">{resource.intro}</p>}
        </div>
        <button className="btn" onClick={() => setEditing('new')}>Add {resource.singular}</button>
      </div>
      {loadError && <p className="err">{loadError}</p>}
      {!rows ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card muted">Nothing here yet.</div>
      ) : (
        <table>
          <thead>
            <tr>{resource.columns.map((c) => <th key={c.label}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="click" onClick={() => setEditing(r)}>
                {resource.columns.map((c) => <td key={c.label}>{c.value(r, lookups)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <EditDrawer
          resource={resource}
          row={editing === 'new' ? null : editing}
          choices={choices}
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

function EditDrawer({
  resource,
  row,
  choices,
  onClose,
  onSaved,
}: {
  resource: Resource;
  row: Row | null;
  choices: Choices;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !row;
  const fields = resource.fields.filter((f) => !(isNew && f.editOnly) && !(!isNew && f.createOnly));
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(resource.fields.map((f) => [f.key, initialValue(f, row)])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  function set(key: string, value: unknown) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: '' }));
    setFormError('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const missing: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.key];
      if (f.required && (v === '' || v == null)) missing[f.key] = 'Required';
      if (f.type === 'password' && isNew && !v) missing[f.key] = 'Required for a new login';
      if (f.type === 'number' && v !== '' && v != null && Number.isNaN(Number(v))) missing[f.key] = 'Enter a number';
      if (f.type === 'percent' && v !== '' && v != null && Number.isNaN(Number(v))) missing[f.key] = 'Enter a number, e.g. 2.5';
    }
    if (Object.keys(missing).length) {
      setErrors(missing);
      setFormError('Please fix the highlighted fields');
      return;
    }
    setBusy(true);
    try {
      const body = toBody(fields, values, isNew);
      if (isNew) await api(resource.path, { method: 'POST', body });
      else await api(`${resource.path}/${row!.id}`, { method: 'PATCH', body });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldErrors: Record<string, string> = {};
        for (const i of err.issues) fieldErrors[i.path.split('.')[0]] = i.message;
        setErrors(fieldErrors);
        setFormError(err.issues.length ? 'Please fix the highlighted fields' : err.message);
      } else setFormError('Could not save');
      setBusy(false);
    }
  }

  async function remove() {
    if (!row || !confirm(`Delete this ${resource.singular}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api(`${resource.path}/${row.id}`, { method: 'DELETE' });
      onSaved();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not delete');
      setBusy(false);
    }
  }

  return (
    <div className="drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="drawer" onSubmit={submit} noValidate>
        <div className="head">
          <h2>{isNew ? `Add ${resource.singular}` : `Edit ${resource.singular}`}</h2>
          <button type="button" className="btn line" onClick={onClose}>Close</button>
        </div>
        <div className="form">
          {fields.map((f) => (
            <FieldInput key={f.key} field={f} value={values[f.key]} error={errors[f.key]} choices={choices[f.key] ?? f.options ?? []} onChange={(v) => set(f.key, v)} />
          ))}
        </div>
        {formError && <p className="err" style={{ marginTop: 14 }} role="alert">{formError}</p>}
        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <span className="spacer" />
          {!isNew && resource.canDelete && (
            <button type="button" className="btn danger" onClick={remove} disabled={busy}>Delete</button>
          )}
        </div>
      </form>
    </div>
  );
}

function FieldInput({
  field,
  value,
  error,
  choices,
  onChange,
}: {
  field: Field;
  value: unknown;
  error?: string;
  choices: { value: string; label: string }[];
  onChange: (v: unknown) => void;
}) {
  const cls = `f${field.full || field.type === 'textarea' ? ' full' : ''}`;
  const hint = error ? <span className="err">{error}</span> : field.help ? <span className="small">{field.help}</span> : null;

  if (field.type === 'bool') {
    return (
      <label className="f check">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }
  if (field.type === 'refs') {
    const selected = new Set((value as string[]) ?? []);
    return (
      <div className={cls}>
        <span className="small muted">{field.label}</span>
        <div className="multi">
          {choices.length === 0 && <span className="muted small">None available</span>}
          {choices.map((c) => (
            <label key={c.value}>
              <input
                type="checkbox"
                checked={selected.has(c.value)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(c.value);
                  else next.delete(c.value);
                  onChange([...next]);
                }}
              />
              {c.label}
            </label>
          ))}
        </div>
        {hint}
      </div>
    );
  }
  if (field.type === 'select' || field.type === 'ref') {
    return (
      <label className={cls}>
        {field.label}
        <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)}>
          <option value="">{field.type === 'ref' ? '— none —' : '— choose —'}</option>
          {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {hint}
      </label>
    );
  }
  if (field.type === 'textarea') {
    return (
      <label className={cls}>
        {field.label}
        <textarea value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} />
        {hint}
      </label>
    );
  }
  return (
    <label className={cls}>
      {field.label}
      <input
        type={field.type === 'password' ? 'password' : 'text'}
        inputMode={field.type === 'number' || field.type === 'percent' || field.type === 'pin' ? 'decimal' : undefined}
        autoComplete={field.type === 'password' ? 'new-password' : 'off'}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
      />
      {hint}
    </label>
  );
}
