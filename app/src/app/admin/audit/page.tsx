'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Entry {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  at: string;
  user: { name: string; email: string } | null;
}

export default function AuditPage() {
  const [rows, setRows] = useState<Entry[] | null>(null);
  useEffect(() => {
    api<Entry[]>('/admin/audit').then(setRows);
  }, []);
  return (
    <>
      <div className="head">
        <div>
          <h1>Audit log</h1>
          <p className="muted">The latest 200 changes made in Admin and POS.</p>
        </div>
      </div>
      {!rows ? (
        <p className="muted">Loading…</p>
      ) : (
        <table>
          <thead>
            <tr><th>When</th><th>Who</th><th>What</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="small">{new Date(r.at).toLocaleString('en-GB')}</td>
                <td>{r.user?.name ?? '—'}</td>
                <td className="small">{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
