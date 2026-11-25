import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Field, Input, Loading, Modal, PageTitle, Select, StatusBadge, Table, Textarea, useAction } from '../components/ui.jsx';
import { ymd } from '../utils.js';

// FR-TD-02 (license check) and FR-TD-03 (checklist, battery >= 80% for EVs, feedback)
export function TestDrivesStaff() {
  const { t } = useTranslation(); const { user } = useAuth(); const qc = useQueryClient(); const [run, busy] = useAction();
  const [date, setDate] = useState(ymd(new Date())); const [mine, setMine] = useState(user.role === 'sales_consultant'); const [sel, setSel] = useState(null); const [f, setF] = useState({});
  const q = useQuery({ queryKey: ['td-staff', date, mine], queryFn: () => api.get(`/testdrives?date=${date}${mine ? '&mine=1' : ''}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['td-staff'] });
  const verify = async (id) => { if (await run(() => api.post(`/testdrives/${id}/verify-license`), t('common.saved'))) refresh(); };
  const save = async (complete) => { const r = await run(() => api.put(`/testdrives/${sel.id}/checklist`, { battery_percent: f.battery_percent === '' || f.battery_percent == null ? undefined : Number(f.battery_percent), feedback: f.feedback, complete }), t('common.saved')); if (r) { setSel(null); refresh(); } };
  return <div><PageTitle>{t('staff.testdrives')}</PageTitle>
    <div className="mb-4 flex flex-wrap items-end gap-3"><Field label={t('acc.date')}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />{t('td.mine_only')}</label></div>
    <div className="card p-0 sm:p-0"><Loading q={q}>{(rows) => <Table rows={rows} cols={[{ label: t('td.time'), render: (r) => r.slot_start.slice(11, 16) }, { label: t('form.name'), render: (r) => <div>{r.name}<div className="text-xs text-slate-500">{r.phone}</div></div> }, { label: t('acc.car'), render: (r) => r.car || r.car_label }, { label: t('acc.status'), render: (r) => <StatusBadge value={r.status} /> },
      { label: t('td.license'), render: (r) => r.license_verified ? <Badge tone="green">{t('td.verified')}</Badge> : r.license_uploaded ? <button className="btn-secondary btn-sm" disabled={busy} onClick={() => verify(r.id)}>{t('td.verify')}</button> : <Badge tone="amber">{t('td.missing')}</Badge> },
      { label: '', render: (r) => r.status === 'booked' || r.status === 'completed' ? <button className="btn-secondary btn-sm" onClick={() => { setSel(r); setF({ battery_percent: r.battery_percent ?? '', feedback: r.feedback || '' }); }}>{t('td.checklist')}</button> : null }]} />}</Loading></div>
    {sel && <Modal title={`${t('td.checklist')} — ${sel.name}`} onClose={() => setSel(null)}><div className="space-y-3">
      <Field label={t('td.battery')} hint={t('td.battery_hint')}><Input type="number" min="0" max="100" value={f.battery_percent} onChange={(e) => setF({ ...f, battery_percent: e.target.value })} /></Field>
      <Field label={t('td.feedback')}><Textarea value={f.feedback} onChange={(e) => setF({ ...f, feedback: e.target.value })} /></Field>
      <div className="flex gap-2"><button className="btn-secondary" disabled={busy} onClick={() => save(false)}>{t('common.save')}</button><button className="btn-primary" disabled={busy} onClick={() => save(true)}>{t('td.complete')}</button></div></div></Modal>}</div>;
}
