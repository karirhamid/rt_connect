import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus, Check, X, FileText, RotateCcw, Loader, CalendarDays, Users,
  CheckCircle, AlertTriangle, Edit2, Wallet,
} from 'lucide-react';
import api from '../services/api';

const STATUS_STYLE = {
  pending:   'bg-amber-100 text-amber-800',
  approved:  'bg-emerald-100 text-emerald-700',
  rejected:  'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};
const TYPE_KEY = { annual: 'leaveAnnual', sick: 'leaveSick', other: 'leaveOther' };

export default function Leave() {
  const { t } = useTranslation();
  const thisYear = new Date().getFullYear();

  const perms = (() => { try { return JSON.parse(localStorage.getItem('_userPerms') || '[]'); } catch { return []; } })();
  const canManage = perms.includes('leave.manage') || perms.includes('roles.manage');
  const canRequest = canManage || perms.includes('leave.request');
  const canApproveTop = perms.includes('leave.approve_top') || perms.includes('roles.manage');

  const [tab, setTab] = useState('requests');      // requests | balances | supervisors
  const [year, setYear] = useState(thisYear);
  const [status, setStatus] = useState('');
  const [employees, setEmployees] = useState([]);
  const [requests, setRequests] = useState([]);
  const [balances, setBalances] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editBal, setEditBal] = useState(null);    // balance row being edited

  const flash = (kind, msg) => { setToast({ kind, msg }); setTimeout(() => setToast(null), 3200); };

  useEffect(() => {
    api.getEmployees().then(d => {
      const list = Array.isArray(d) ? d : (d?.employees || []);
      // unique by matricule
      const seen = new Set(); const uniq = [];
      list.forEach(e => { const m = e.user_id || e.id; if (!seen.has(m)) { seen.add(m); uniq.push(e); } });
      setEmployees(uniq);
    }).catch(() => {});
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (status) p.append('status', status);
      if (year) p.append('year', year);
      const resp = await api.authFetch(`/api/leave/requests?${p}`, { method: 'GET' });
      if (resp.ok) { const d = await resp.json(); setRequests(d.requests || []); }
      else setRequests([]);
    } catch { setRequests([]); } finally { setLoading(false); }
  }, [status, year]);

  const loadBalances = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.authFetch(`/api/leave/balances?year=${year}`, { method: 'GET' });
      if (resp.ok) { const d = await resp.json(); setBalances(d.balances || []); }
      else setBalances([]);
    } catch { setBalances([]); } finally { setLoading(false); }
  }, [year]);

  const loadSupervisors = useCallback(async () => {
    setLoading(true);
    try {
      const [supResp, depResp] = await Promise.all([
        api.authFetch('/api/leave/supervisors', { method: 'GET' }),
        api.authFetch('/api/departments', { method: 'GET' }),
      ]);
      if (supResp.ok) { const d = await supResp.json(); setSupervisors(d.supervisors || []); }
      if (depResp.ok) { const d = await depResp.json(); setDepartments(Array.isArray(d) ? d : (d?.departments || [])); }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'requests') loadRequests();
    else if (tab === 'balances') loadBalances();
    else loadSupervisors();
  }, [tab, loadRequests, loadBalances, loadSupervisors]);

  const addSupervisor = async (department_id, supervisor_user_id) => {
    const resp = await api.authFetch('/api/leave/supervisors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ department_id: Number(department_id), supervisor_user_id }),
    });
    if (resp.ok) { flash('ok', t('leaveActionDone') || 'Fait'); loadSupervisors(); }
    else { const e = await resp.json().catch(() => ({})); flash('err', e.detail || 'Erreur'); }
  };
  const removeSupervisor = async (id) => {
    const resp = await api.authFetch(`/api/leave/supervisors/${id}`, { method: 'DELETE' });
    if (resp.ok) loadSupervisors();
  };

  const act = async (id, action, body) => {
    setBusyId(id);
    try {
      const resp = await api.authFetch(`/api/leave/requests/${id}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (resp.ok) { flash('ok', t('leaveActionDone') || 'Fait'); await loadRequests(); }
      else { const e = await resp.json().catch(() => ({})); flash('err', e.detail || 'Erreur'); }
    } catch (e) { flash('err', e.message || 'Erreur'); } finally { setBusyId(null); }
  };

  const downloadPdf = async (id, matricule) => {
    try {
      const resp = await api.authFetch(`/api/leave/requests/${id}/pdf?lang=fr`, { method: 'GET' });
      if (!resp.ok) { flash('err', 'PDF'); return; }
      const url = URL.createObjectURL(await resp.blob());
      const a = document.createElement('a'); a.href = url; a.download = `demande_conge_${matricule}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { flash('err', e.message); }
  };

  const fmtDays = (n) => (Number(n) % 1 === 0 ? String(Number(n)) : Number(n).toFixed(1));

  return (
    <div className="space-y-6">
      {/* Header + tabs */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t('leaveTitle') || 'Congés'}</h1>
          <p className="text-sm text-gray-500">{t('leaveSubtitle') || 'Demandes de congé et soldes annuels.'}</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="border rounded-lg px-3 py-2 text-sm bg-white" value={year} onChange={e => setYear(Number(e.target.value))}>
            {[thisYear - 1, thisYear, thisYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {tab === 'requests' && canRequest && (
            <button onClick={() => setShowCreate(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700">
              <Plus className="w-4 h-4" /> {t('leaveNew') || 'Nouvelle demande'}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex border-b">
          {(canManage ? ['requests', 'balances', 'supervisors'] : ['requests', 'balances']).map(tb => (
            <button key={tb} onClick={() => setTab(tb)}
                    className={`px-5 py-3 text-sm font-medium inline-flex items-center gap-2 ${tab === tb ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}>
              {tb === 'requests' ? <CalendarDays className="w-4 h-4" /> : tb === 'balances' ? <Wallet className="w-4 h-4" /> : <Users className="w-4 h-4" />}
              {tb === 'requests' ? (t('leaveRequests') || 'Demandes') : tb === 'balances' ? (t('leaveBalances') || 'Soldes') : (t('leaveSupervisors') || 'Superviseurs')}
            </button>
          ))}
          {tab === 'requests' && (
            <div className="ml-auto flex items-center pr-3">
              <select className="border rounded-lg px-2 py-1.5 text-xs bg-white my-2" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">{t('leaveAllStatus') || 'Tous les statuts'}</option>
                <option value="pending">{t('leaveStPending') || 'En attente'}</option>
                <option value="approved">{t('leaveStApproved') || 'Approuvé'}</option>
                <option value="rejected">{t('leaveStRejected') || 'Refusé'}</option>
                <option value="cancelled">{t('leaveStCancelled') || 'Annulé'}</option>
              </select>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
            <Loader className="w-5 h-5 animate-spin" /><span className="text-sm">{t('loading')}...</span>
          </div>
        ) : tab === 'requests' ? (
          <RequestsTable requests={requests} canManage={canManage} canRequest={canRequest} canApproveTop={canApproveTop} busyId={busyId}
                         t={t} act={act} downloadPdf={downloadPdf} fmtDays={fmtDays} />
        ) : tab === 'balances' ? (
          <BalancesTable balances={balances} canManage={canManage} t={t} fmtDays={fmtDays} onEdit={setEditBal} />
        ) : (
          <SupervisorsTab supervisors={supervisors} departments={departments} employees={employees}
                          t={t} onAdd={addSupervisor} onRemove={removeSupervisor} />
        )}
      </div>

      {showCreate && (
        <CreateLeaveModal employees={employees} t={t} onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); flash('ok', t('leaveCreated') || 'Demande créée'); loadRequests(); }}
          onError={(m) => flash('err', m)} />
      )}
      {editBal && (
        <EditBalanceModal row={editBal} year={year} t={t} onClose={() => setEditBal(null)}
          onSaved={() => { setEditBal(null); flash('ok', t('settingsSaved') || 'Enregistré'); loadBalances(); }}
          onError={(m) => flash('err', m)} />
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm ${toast.kind === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.kind === 'ok' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}{toast.msg}
        </div>
      )}
    </div>
  );
}

function RequestsTable({ requests, canManage, canRequest, canApproveTop, busyId, t, act, downloadPdf, fmtDays }) {
  const canActOnStage = (r) => (r.stage === 'top' ? canApproveTop : canManage);
  if (requests.length === 0)
    return <div className="px-4 py-12 text-center text-gray-400 text-sm">{t('leaveNoRequests') || 'Aucune demande.'}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-3">{t('employeeName') || 'Employé'}</th>
            <th className="px-4 py-3">{t('leaveType') || 'Type'}</th>
            <th className="px-4 py-3">{t('leavePeriod') || 'Période'}</th>
            <th className="px-4 py-3 text-center">{t('leaveDays') || 'Jours'}</th>
            <th className="px-4 py-3 text-center">{t('status') || 'Statut'}</th>
            <th className="px-4 py-3 text-right">{t('actions') || 'Actions'}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {requests.map(r => (
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="px-4 py-2.5">
                <div className="font-medium text-gray-900">{r.employee_name || r.employee_user_id}</div>
                <div className="text-xs text-gray-500">{r.employee_user_id}</div>
              </td>
              <td className="px-4 py-2.5 text-gray-700">{t(TYPE_KEY[r.type]) || r.type}</td>
              <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                {r.start_date}{r.end_date !== r.start_date ? ` → ${r.end_date}` : ''}
                {(r.start_fraction !== 'full' || r.end_fraction !== 'full') && (
                  <span className="ml-1 text-xs text-gray-400">½</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-center font-medium">{fmtDays(r.working_days)}</td>
              <td className="px-4 py-2.5 text-center">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[r.status] || 'bg-gray-100'}`}>
                  {t('leaveSt' + r.status.charAt(0).toUpperCase() + r.status.slice(1)) || r.status}
                </span>
                {r.status === 'pending' && r.stage && (
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {t('leaveStage' + r.stage.charAt(0).toUpperCase() + r.stage.slice(1)) ||
                     ({ supervisor: 'superviseur', hr: 'RH', top: 'direction' }[r.stage])}
                  </div>
                )}
              </td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                {r.status === 'pending' && canActOnStage(r) && (
                  <>
                    <button disabled={busyId === r.id} onClick={() => act(r.id, 'approve')}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded disabled:opacity-50">
                      <Check className="w-3.5 h-3.5" /> {t('approve') || 'Approuver'}
                    </button>
                    <button disabled={busyId === r.id} onClick={() => act(r.id, 'reject', { reason: '' })}
                            className="ml-1 inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 border border-red-200 hover:bg-red-50 rounded disabled:opacity-50">
                      <X className="w-3.5 h-3.5" /> {t('reject') || 'Refuser'}
                    </button>
                  </>
                )}
                {r.status === 'pending' && canRequest && !canManage && !canActOnStage(r) && (
                  <button disabled={busyId === r.id} onClick={() => act(r.id, 'cancel')}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 border rounded hover:bg-gray-50 disabled:opacity-50">
                    <RotateCcw className="w-3.5 h-3.5" /> {t('cancel') || 'Annuler'}
                  </button>
                )}
                <button onClick={() => downloadPdf(r.id, r.employee_user_id)}
                        className="ml-1 inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 border rounded hover:bg-gray-50" title="PDF">
                  <FileText className="w-3.5 h-3.5" /> PDF
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BalancesTable({ balances, canManage, t, fmtDays, onEdit }) {
  if (balances.length === 0)
    return <div className="px-4 py-12 text-center text-gray-400 text-sm">{t('leaveNoBalances') || 'Aucun employé.'}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-3">{t('employeeName') || 'Employé'}</th>
            <th className="px-4 py-3">{t('department') || 'Département'}</th>
            <th className="px-4 py-3 text-center">{t('leaveEntitled') || 'Droit'}</th>
            <th className="px-4 py-3 text-center">{t('leaveUsed') || 'Pris'}</th>
            <th className="px-4 py-3 text-center">{t('leaveRemaining') || 'Restant'}</th>
            {canManage && <th className="px-4 py-3 text-right">{t('actions') || 'Actions'}</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {balances.map(b => (
            <tr key={b.employee_user_id} className="hover:bg-gray-50">
              <td className="px-4 py-2.5">
                <div className="font-medium text-gray-900">{b.employee_name}</div>
                <div className="text-xs text-gray-500">{b.employee_user_id}</div>
              </td>
              <td className="px-4 py-2.5 text-gray-600">{b.department}</td>
              <td className="px-4 py-2.5 text-center text-gray-700">{fmtDays(b.entitled_days + b.carried_over)}</td>
              <td className="px-4 py-2.5 text-center text-gray-700">{fmtDays(b.used_days)}</td>
              <td className={`px-4 py-2.5 text-center font-semibold ${b.remaining_days < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{fmtDays(b.remaining_days)}</td>
              {canManage && (
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => onEdit(b)} className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 border rounded hover:bg-gray-50">
                    <Edit2 className="w-3.5 h-3.5" /> {t('edit') || 'Modifier'}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateLeaveModal({ employees, t, onClose, onCreated, onError }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    employee_user_id: '', type: 'annual', start_date: today, end_date: today,
    start_fraction: 'full', end_fraction: 'full', reason: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const single = form.start_date === form.end_date;

  const submit = async () => {
    if (!form.employee_user_id) { onError(t('leavePickEmployee') || 'Choisissez un employé'); return; }
    setSaving(true);
    try {
      const resp = await api.authFetch('/api/leave/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      if (resp.ok) onCreated();
      else { const e = await resp.json().catch(() => ({})); onError(e.detail || 'Erreur'); }
    } catch (e) { onError(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{t('leaveNew') || 'Nouvelle demande'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('employeeName') || 'Employé'}</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.employee_user_id} onChange={e => set('employee_user_id', e.target.value)}>
              <option value="">—</option>
              {employees.map(e => <option key={e.user_id || e.id} value={e.user_id || e.id}>{e.name} ({e.user_id || e.id})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('leaveType') || 'Type'}</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="annual">{t('leaveAnnual') || 'Congé annuel'}</option>
              <option value="sick">{t('leaveSick') || 'Congé maladie'}</option>
              <option value="other">{t('leaveOther') || 'Autre'}</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('from') || 'Du'}</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.start_date}
                     onChange={e => set('start_date', e.target.value)} />
              <select className="w-full border rounded-lg px-2 py-1 text-xs mt-1" value={form.start_fraction} onChange={e => set('start_fraction', e.target.value)}>
                <option value="full">{t('leaveFull') || 'Journée'}</option>
                <option value="am">{t('leaveAm') || 'Matin'}</option>
                <option value="pm">{t('leavePm') || 'Après-midi'}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('to') || 'Au'}</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.end_date}
                     min={form.start_date} onChange={e => set('end_date', e.target.value)} />
              {!single && (
                <select className="w-full border rounded-lg px-2 py-1 text-xs mt-1" value={form.end_fraction} onChange={e => set('end_fraction', e.target.value)}>
                  <option value="full">{t('leaveFull') || 'Journée'}</option>
                  <option value="am">{t('leaveAm') || 'Matin'}</option>
                  <option value="pm">{t('leavePm') || 'Après-midi'}</option>
                </select>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('leaveReason') || 'Motif'}</label>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={form.reason} onChange={e => set('reason', e.target.value)} />
          </div>
        </div>
        <div className="px-5 py-4 bg-gray-50 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('cancel') || 'Annuler'}</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{t('leaveCreate') || 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditBalanceModal({ row, year, t, onClose, onSaved, onError }) {
  const [entitled, setEntitled] = useState(row.entitled_days);
  const [carried, setCarried] = useState(row.carried_over);
  const [note, setNote] = useState(row.note || '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const resp = await api.authFetch('/api/leave/balance', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_user_id: row.employee_user_id, year, entitled_days: Number(entitled), carried_over: Number(carried), note }),
      });
      if (resp.ok) onSaved(); else { const e = await resp.json().catch(() => ({})); onError(e.detail || 'Erreur'); }
    } catch (e) { onError(e.message); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 bg-gray-900/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">{t('leaveEditBalance') || 'Solde de congés'} · {year}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{row.employee_name} ({row.employee_user_id})</p>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('leaveEntitled') || 'Droit annuel'}</label>
            <input type="number" step="0.5" className="w-full border rounded-lg px-3 py-2 text-sm" value={entitled} onChange={e => setEntitled(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('leaveCarried') || 'Report (année préc.)'}</label>
            <input type="number" step="0.5" className="w-full border rounded-lg px-3 py-2 text-sm" value={carried} onChange={e => setCarried(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('note') || 'Note'}</label>
            <input type="text" className="w-full border rounded-lg px-3 py-2 text-sm" value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <div className="px-5 py-4 bg-gray-50 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('cancel') || 'Annuler'}</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{t('save') || 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SupervisorsTab({ supervisors, departments, employees, t, onAdd, onRemove }) {
  const [dept, setDept] = useState('');
  const [emp, setEmp] = useState('');
  // group assignments by department
  const byDept = {};
  supervisors.forEach(s => { (byDept[s.department_name] = byDept[s.department_name] || []).push(s); });

  return (
    <div className="p-4 space-y-4">
      {/* Add form */}
      <div className="flex flex-wrap items-end gap-2 bg-gray-50 rounded-lg p-3 border">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('department') || 'Département'}</label>
          <select className="border rounded-lg px-3 py-2 text-sm bg-white min-w-[10rem]" value={dept} onChange={e => setDept(e.target.value)}>
            <option value="">—</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('leaveSupervisor') || 'Superviseur'}</label>
          <select className="border rounded-lg px-3 py-2 text-sm bg-white min-w-[12rem]" value={emp} onChange={e => setEmp(e.target.value)}>
            <option value="">—</option>
            {employees.map(e => <option key={e.user_id || e.id} value={e.user_id || e.id}>{e.name} ({e.user_id || e.id})</option>)}
          </select>
        </div>
        <button disabled={!dept || !emp} onClick={() => { onAdd(dept, emp); setEmp(''); }}
                className="inline-flex items-center gap-1 px-3 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50">
          + {t('add') || 'Ajouter'}
        </button>
      </div>

      {supervisors.length === 0 ? (
        <div className="px-4 py-8 text-center text-gray-400 text-sm">{t('leaveNoSupervisors') || 'Aucun superviseur défini.'}</div>
      ) : (
        <div className="space-y-3">
          {Object.entries(byDept).map(([dname, list]) => (
            <div key={dname} className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b text-sm font-semibold text-gray-700">{dname}</div>
              <ul className="divide-y">
                {list.map(s => (
                  <li key={s.id} className="px-4 py-2 flex items-center justify-between text-sm">
                    <span className="text-gray-800">{s.supervisor_name} <span className="text-xs text-gray-400">({s.supervisor_user_id})</span></span>
                    <button onClick={() => onRemove(s.id)} className="text-xs text-red-600 hover:underline">{t('remove') || 'Retirer'}</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
