import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, AlertTriangle, Loader, Save, RotateCcw, ClipboardCheck } from 'lucide-react';
import api from '../services/api';

/**
 * "Validation des pointages" — punch review panel shown below the Reports page.
 *
 * Defaults to today, shows every employee who punched that day (even a single
 * punch), filterable by day + employee. For each person the reviewer can pick
 * which punch is the Entrée / Sortie / Pause (out/in). Saving writes a per-day
 * override that the backend applies everywhere (reports, Today, lateness) via
 * get_employee_day_summary. Clearing reverts to auto-detection.
 *
 * Self-contained: its own date/employee filters, independent of the report's.
 */
export default function PunchReviewPanel() {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState(today);
  const [empFilter, setEmpFilter] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState({});      // user_id -> {entry,break_out,break_in,exit}
  const [savingId, setSavingId] = useState(null);
  const [toast, setToast] = useState(null);

  const canWrite = (() => {
    try {
      const p = JSON.parse(localStorage.getItem('_userPerms') || '[]');
      return p.includes('attendance.write') || p.includes('roles.manage') || p.includes('manage_users');
    } catch { return false; }
  })();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (date) params.append('target_date', date);
      if (empFilter.trim()) params.append('employee_id', empFilter.trim());
      const resp = await api.authFetch(`/api/attendance/review?${params}`, { method: 'GET' });
      if (resp.ok) {
        const data = await resp.json();
        const list = data.items || [];
        setItems(list);
        const d = {};
        list.forEach((it) => {
          const r = it.resolution;
          d[it.user_id] = {
            entry:     r?.entry_attendance_id ?? '',
            break_out: r?.break_out_attendance_id ?? '',
            break_in:  r?.break_in_attendance_id ?? '',
            exit:      r?.exit_attendance_id ?? '',
          };
        });
        setDrafts(d);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [date, empFilter]);

  useEffect(() => { load(); }, [load]);

  const setDraft = (uid, field, val) =>
    setDrafts((p) => ({ ...p, [uid]: { ...(p[uid] || {}), [field]: val } }));

  const flash = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

  const save = async (it) => {
    setSavingId(it.user_id);
    try {
      const d = drafts[it.user_id] || {};
      const body = {
        user_id: it.user_id,
        date,
        entry_attendance_id:     d.entry     ? Number(d.entry)     : null,
        break_out_attendance_id: d.break_out ? Number(d.break_out) : null,
        break_in_attendance_id:  d.break_in  ? Number(d.break_in)  : null,
        exit_attendance_id:      d.exit      ? Number(d.exit)      : null,
      };
      const resp = await api.authFetch('/api/attendance/review', {
        method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
      });
      if (resp.ok) { flash('ok', t('reviewSaved') || 'Validé'); await load(); }
      else { const e = await resp.json().catch(() => ({})); flash('err', e.detail || 'Error'); }
    } catch (e) { flash('err', e.message || 'Error'); }
    finally { setSavingId(null); }
  };

  const clear = async (it) => {
    setSavingId(it.user_id);
    try {
      const resp = await api.authFetch(`/api/attendance/review/${encodeURIComponent(it.user_id)}/${date}`, { method: 'DELETE' });
      if (resp.ok) { flash('ok', t('reviewReverted') || 'Auto'); await load(); }
    } catch (e) { flash('err', e.message || 'Error'); }
    finally { setSavingId(null); }
  };

  // A <select> over the day's punches for one role (entrée/sortie/break).
  const PunchSelect = ({ it, field, label, color }) => (
    <label className="flex flex-col gap-0.5">
      <span className={`text-[10px] font-medium uppercase ${color}`}>{label}</span>
      <select
        className="border rounded px-2 py-1 text-xs bg-white text-gray-900 disabled:bg-gray-50 min-w-[5.5rem]"
        value={(drafts[it.user_id]?.[field]) ?? ''}
        disabled={!canWrite}
        onChange={(e) => setDraft(it.user_id, field, e.target.value)}
      >
        <option value="">—</option>
        {it.punches.map((p) => (
          <option key={p.id} value={p.id}>{p.time}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border mt-6">
      {/* Header + filters */}
      <div className="p-4 border-b flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {t('reviewTitle') || 'Validation des pointages'}
            </h2>
            <p className="text-xs text-gray-500">
              {t('reviewDesc') || "Choisir l'entrée / la sortie quand un employé pointe plusieurs fois."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('reviewDay') || 'Jour'}</label>
            <input type="date" value={date} max={today}
                   onChange={(e) => setDate(e.target.value)}
                   className="border rounded-lg px-3 py-2 text-sm bg-white text-gray-900" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('employeeId') || 'Matricule'}</label>
            <input type="text" value={empFilter} placeholder={t('all') || 'Tous'}
                   onChange={(e) => setEmpFilter(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && load()}
                   className="border rounded-lg px-3 py-2 text-sm bg-white text-gray-900 w-28" />
          </div>
          <button onClick={load} disabled={loading}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 text-gray-700 disabled:opacity-50">
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            {t('refresh') || 'Actualiser'}
          </button>
        </div>
      </div>

      {!canWrite && (
        <div className="px-4 py-2 text-xs text-amber-800 bg-amber-50 border-b border-amber-100">
          {t('reviewReadonly') || 'Lecture seule — vous n’avez pas la permission de valider les pointages.'}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-12 text-gray-400">
          <Loader className="w-5 h-5 animate-spin" /><span className="text-sm">{t('loading')}...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-12 text-center text-gray-400 text-sm">
          {t('reviewNoData') || 'Aucun pointage ce jour.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">{t('employeeName') || 'Employé'}</th>
                <th className="px-4 py-3">{t('punches') || 'Pointages'}</th>
                <th className="px-4 py-3">{t('reviewPick') || 'Désignation'}</th>
                <th className="px-4 py-3 text-right">{t('actions') || 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((it) => {
                const resolved = !!it.resolution;
                return (
                  <tr key={it.user_id} className="hover:bg-gray-50 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{it.employee_name}</div>
                      <div className="text-xs text-gray-500">{it.user_id} · {it.department}</div>
                      <div className="mt-1 flex items-center gap-1">
                        {resolved
                          ? <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700"><CheckCircle className="w-3 h-3" />{t('reviewResolved') || 'Validé'}</span>
                          : it.needs_review
                            ? <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800"><AlertTriangle className="w-3 h-3" />{t('reviewNeeds') || 'À revoir'}</span>
                            : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{t('reviewAuto') || 'Auto'}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[16rem]">
                        {it.punches.map((p) => (
                          <span key={p.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono bg-gray-100 text-gray-700" title={p.device_name}>
                            {p.time}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <PunchSelect it={it} field="entry"     label={t('checkIn') || 'Entrée'}     color="text-green-700" />
                        <PunchSelect it={it} field="break_out" label={t('breakOut') || 'Pause →'}   color="text-amber-700" />
                        <PunchSelect it={it} field="break_in"  label={t('breakIn') || '→ Retour'}   color="text-cyan-700" />
                        <PunchSelect it={it} field="exit"      label={t('checkOut') || 'Sortie'}    color="text-blue-700" />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => save(it)} disabled={!canWrite || savingId === it.user_id}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded disabled:opacity-50">
                        {savingId === it.user_id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        {t('reviewSave') || 'Valider'}
                      </button>
                      {resolved && (
                        <button onClick={() => clear(it)} disabled={!canWrite || savingId === it.user_id}
                                className="ml-1 inline-flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 border rounded hover:bg-gray-50 disabled:opacity-50"
                                title={t('reviewRevertHint') || 'Revenir à la détection automatique'}>
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
