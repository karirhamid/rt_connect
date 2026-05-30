import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, Clock, Calendar, CheckCircle, AlertCircle, LogIn as LogInIcon, ArrowRight } from 'lucide-react';
import { Portal } from '../services/portalApi';

const fmtMin = (m) => {
  if (!m || m < 1) return '0h00';
  const h = Math.floor(m / 60); const mm = Math.floor(m % 60);
  return `${h}h${String(mm).padStart(2, '0')}`;
};

const fmtDate = (d) => d.toISOString().slice(0, 10);
const fmtDays = (n) => (Number(n) % 1 === 0 ? String(Number(n)) : Number(n).toFixed(1));

/**
 * Pair punches in/out and return total worked minutes + a flag for "still in".
 * Assumes punches sorted ascending. punch === 0 → IN, punch === 1 → OUT.
 */
function summarizePunches(punches, nowDate) {
  let total = 0;
  let stillIn = false;
  let firstIn = null;
  let lastOut = null;
  let pendingIn = null;
  for (const p of punches) {
    const ts = new Date(p.timestamp);
    if (p.punch === 0) {
      if (!firstIn) firstIn = ts;
      pendingIn = ts;
    } else {
      lastOut = ts;
      if (pendingIn) {
        total += (ts - pendingIn) / 60000;
        pendingIn = null;
      }
    }
  }
  if (pendingIn) {
    stillIn = true;
    total += (nowDate - pendingIn) / 60000;
  }
  return { total, stillIn, firstIn, lastOut };
}

export default function PortalHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const todayISO = fmtDate(new Date());

  const [me, setMe] = useState(null);
  const [tab, setTab] = useState('today');  // today | month | day
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [pickedDay, setPickedDay] = useState(todayISO);

  const [punches, setPunches] = useState([]);
  const [monthly, setMonthly] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Congés
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [signingId, setSigningId] = useState(null);
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [toValidate, setToValidate] = useState([]);
  const [validatingId, setValidatingId] = useState(null);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ type: 'annual', start_date: todayISO, end_date: todayISO, start_fraction: 'full', end_fraction: 'full', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  // Ticker for the "worked so far" live counter
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const loadMe = useCallback(async () => {
    try {
      const data = await Portal.me();
      setMe(data);
      setError('');
    } catch (e) {
      if (e.status === 401) { navigate('/portal-login'); return; }
      if (e.status === 503 || e.status === 403) {
        setError(e.message || (t('portalDisabled') || "L'espace employé est désactivé."));
        return;
      }
      setError(e.message);
    }
  }, [navigate, t]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      let start, end;
      if (tab === 'today') {
        start = todayISO; end = todayISO;
      } else if (tab === 'day') {
        start = pickedDay; end = pickedDay;
      } else {
        start = fmtDate(new Date(year, month - 1, 1));
        end   = fmtDate(new Date(year, month, 0));
      }
      const punchesData = await Portal.punches(start, end);
      setPunches(Array.isArray(punchesData) ? punchesData : []);

      if (tab === 'month') {
        const monthData = await Portal.monthSummary(year, month);
        setMonthly(monthData || null);
      } else {
        setMonthly(null);
      }
      setError('');
    } catch (e) {
      if (e.status === 401) { navigate('/portal-login'); return; }
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tab, pickedDay, year, month, todayISO, navigate]);

  const loadLeave = useCallback(async () => {
    try {
      const [bal, reqs, sup] = await Promise.all([
        Portal.leaveBalance(year), Portal.leaveRequests(), Portal.isSupervisor(),
      ]);
      setLeaveBalance(bal || null);
      setLeaveRequests((reqs && reqs.requests) || []);
      const isSup = !!(sup && sup.is_supervisor);
      setIsSupervisor(isSup);
      if (isSup) {
        const tv = await Portal.toValidate();
        setToValidate((tv && tv.requests) || []);
      } else setToValidate([]);
    } catch (e) {
      if (e.status === 401) { navigate('/portal-login'); return; }
    }
  }, [year, navigate]);

  const signLeave = async (id) => {
    setSigningId(id);
    try { await Portal.leaveSign(id); await loadLeave(); }
    catch (e) { setError(e.message); }
    finally { setSigningId(null); }
  };

  const submitLeave = async () => {
    setSubmitting(true);
    try {
      await Portal.leaveCreate(leaveForm);
      setShowLeaveForm(false);
      setLeaveForm({ type: 'annual', start_date: todayISO, end_date: todayISO, start_fraction: 'full', end_fraction: 'full', reason: '' });
      await loadLeave();
    } catch (e) { setError(e.message || 'Erreur'); }
    finally { setSubmitting(false); }
  };

  const validateLeave = async (id, approve) => {
    setValidatingId(id);
    try {
      if (approve) await Portal.supervisorApprove(id);
      else await Portal.supervisorReject(id, '');
      await loadLeave();
    } catch (e) { setError(e.message); }
    finally { setValidatingId(null); }
  };

  useEffect(() => { loadMe(); }, [loadMe]);
  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (tab === 'leave') loadLeave(); }, [tab, loadLeave]);

  // Realtime: poll punches every 30s when on Today tab
  useEffect(() => {
    if (tab !== 'today') return;
    const id = setInterval(loadData, 30 * 1000);
    return () => clearInterval(id);
  }, [tab, loadData]);

  // Group punches by day
  const punchesByDay = useMemo(() => {
    const m = new Map();
    for (const p of punches) {
      const d = (p.timestamp || '').slice(0, 10);
      if (!m.has(d)) m.set(d, []);
      m.get(d).push(p);
    }
    for (const arr of m.values()) arr.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return m;
  }, [punches]);

  const todayPunches = punchesByDay.get(todayISO) || [];
  const todaySummary = useMemo(() => summarizePunches(todayPunches, now), [todayPunches, now]);

  const logout = () => {
    localStorage.removeItem('portal_token');
    localStorage.removeItem('portal_employee');
    navigate('/portal-login');
  };

  if (error && !me) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center bg-white p-6 rounded-lg shadow border">
          <div className="text-amber-600 font-medium mb-2">{error}</div>
          <button onClick={() => navigate('/portal-login')} className="text-sm text-primary-600 hover:underline">{t('login') || 'Se connecter'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">{me?.matricule}</div>
            <div className="font-semibold text-gray-900">{me?.name}</div>
            {me?.department && <div className="text-xs text-gray-500">{me.department}</div>}
          </div>
          <button onClick={logout} className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-red-600">
            <LogOut className="w-4 h-4" /> {t('logout') || 'Déconnexion'}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b">
          {[
            { id: 'today', label: t('todayTab') || "Aujourd'hui" },
            { id: 'month', label: t('monthTab') || 'Ce mois' },
            { id: 'day',   label: t('dayTab')   || 'Un jour précis' },
            { id: 'leave', label: t('leaveTitle') || 'Congés' },
          ].map(item => (
            <button key={item.id} onClick={() => setTab(item.id)}
                    className={`px-4 py-2 -mb-px text-sm font-medium border-b-2 ${tab === item.id ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {item.label}
            </button>
          ))}
        </div>

        {/* TODAY */}
        {tab === 'today' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white rounded-lg border p-4">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  <LogInIcon className="w-4 h-4 text-emerald-500" /> {t('firstIn') || 'Première entrée'}
                </div>
                <div className="text-2xl font-semibold font-mono">
                  {todaySummary.firstIn ? todaySummary.firstIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                </div>
              </div>
              <div className="bg-white rounded-lg border p-4">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  <ArrowRight className="w-4 h-4 text-blue-500" /> {t('lastOut') || 'Dernière sortie'}
                </div>
                <div className="text-2xl font-semibold font-mono">
                  {todaySummary.lastOut && !todaySummary.stillIn ? todaySummary.lastOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                </div>
                {todaySummary.stillIn && <div className="text-xs text-emerald-600 mt-1">{t('stillIn') || 'Toujours présent'}</div>}
              </div>
              <div className={`rounded-lg border p-4 ${todaySummary.stillIn ? 'bg-emerald-50 border-emerald-200' : 'bg-white'}`}>
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  <Clock className="w-4 h-4 text-primary-600" /> {t('workedSoFar') || 'Travail (jour)'}
                </div>
                <div className="text-2xl font-semibold font-mono">{fmtMin(todaySummary.total)}</div>
                {todaySummary.stillIn && <div className="text-xs text-emerald-700 mt-1">{t('liveCounter') || 'En cours…'}</div>}
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-lg border p-4">
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary-600" /> {t('todayTimeline') || "Pointages d'aujourd'hui"}
              </h2>
              {todayPunches.length === 0 ? (
                <div className="text-sm text-gray-400 py-6 text-center">{t('noTodayPunch') || "Aucun pointage aujourd'hui."}</div>
              ) : (
                <ol className="relative border-s border-gray-200 ms-3 ps-6 space-y-3">
                  {todayPunches.map((p) => {
                    const isIn = p.punch === 0;
                    return (
                      <li key={p.id} className="relative">
                        <span className={`absolute -start-9 mt-1 inline-flex h-3 w-3 rounded-full ${isIn ? 'bg-emerald-500' : 'bg-blue-500'} ring-4 ring-white`} />
                        <div className="flex items-center justify-between">
                          <div className="font-mono text-sm">{new Date(p.timestamp).toLocaleTimeString()}</div>
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${isIn ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                            {isIn ? (t('checkIn') || 'Entrée') : (t('checkOut') || 'Sortie')}
                          </span>
                        </div>
                        {p.source && p.source !== 'device' && (
                          <div className="text-xs text-amber-700 mt-0.5">{p.source}</div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </>
        )}

        {/* MONTH */}
        {tab === 'month' && (
          <>
            <div className="bg-white rounded-lg border p-4 flex flex-wrap gap-3 items-end">
              <Calendar className="w-5 h-5 text-primary-600" />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('year') || 'Année'}</label>
                <input type="number" min="2020" max="2099" value={year}
                       onChange={(e) => setYear(parseInt(e.target.value) || new Date().getFullYear())}
                       className="w-24 px-2 py-1.5 border rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('month') || 'Mois'}</label>
                <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}
                        className="px-2 py-1.5 border rounded text-sm">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
                </select>
              </div>
            </div>

            {monthly && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: t('daysWorked') || 'Jours',   value: monthly.totals.days,             color: 'text-blue-600' },
                  { label: t('worked')     || 'Travail', value: fmtMin(monthly.totals.worked),   color: 'text-emerald-600' },
                  { label: t('overtime')   || 'Sup.',    value: fmtMin(monthly.totals.overtime), color: 'text-purple-600' },
                  { label: t('lateMin')    || 'Retard',  value: fmtMin(monthly.totals.late),     color: 'text-amber-600' },
                  { label: t('earlyMin')   || 'Dép. ant.', value: fmtMin(monthly.totals.early),  color: 'text-orange-600' },
                ].map((s, i) => (
                  <div key={i} className="bg-white border rounded-lg p-3">
                    <div className="text-xs text-gray-500">{s.label}</div>
                    <div className={`text-xl font-semibold mt-1 ${s.color}`}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            <DayList punchesByDay={punchesByDay} t={t} />
          </>
        )}

        {/* DAY */}
        {tab === 'day' && (
          <>
            <div className="bg-white rounded-lg border p-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('selectDay') || 'Sélectionner un jour'}</label>
              <input type="date" value={pickedDay} onChange={(e) => setPickedDay(e.target.value)}
                     max={todayISO}
                     className="px-3 py-2 border rounded text-sm" />
            </div>
            <DayList punchesByDay={punchesByDay} t={t} singleDay={pickedDay} />
          </>
        )}

        {/* LEAVE / CONGÉS */}
        {tab === 'leave' && (
          <>
            {/* Balance cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { k: 'entitled', label: t('leaveEntitled') || 'Droit', val: leaveBalance ? (leaveBalance.entitled_days + leaveBalance.carried_over) : '—', cls: 'text-gray-900' },
                { k: 'used',     label: t('leaveUsed') || 'Pris',     val: leaveBalance ? leaveBalance.used_days : '—', cls: 'text-amber-700' },
                { k: 'remaining',label: t('leaveRemaining') || 'Restant', val: leaveBalance ? leaveBalance.remaining_days : '—', cls: 'text-emerald-700' },
              ].map(c => (
                <div key={c.k} className="bg-white rounded-lg border p-4 text-center">
                  <div className="text-xs text-gray-500">{c.label}</div>
                  <div className={`text-2xl font-bold mt-1 ${c.cls}`}>{c.val}</div>
                </div>
              ))}
            </div>

            {/* Supervisor: requests to validate */}
            {isSupervisor && toValidate.length > 0 && (
              <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-amber-100 bg-amber-50 text-sm font-semibold text-amber-800">
                  {t('leaveToValidate') || 'À valider (mon équipe)'} · {toValidate.length}
                </div>
                <ul className="divide-y">
                  {toValidate.map(r => (
                    <li key={r.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{r.employee_name}
                          <span className="ml-2 text-xs text-gray-500">{r.start_date}{r.end_date !== r.start_date ? ` → ${r.end_date}` : ''} · {fmtDays(r.working_days)} {t('days') || 'j'}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {t({ annual: 'leaveAnnual', sick: 'leaveSick', other: 'leaveOther' }[r.type]) || r.type}{r.reason ? ` · ${r.reason}` : ''}
                        </div>
                      </div>
                      <button disabled={validatingId === r.id} onClick={() => validateLeave(r.id, true)}
                              className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded disabled:opacity-50">
                        {t('approve') || 'Approuver'}
                      </button>
                      <button disabled={validatingId === r.id} onClick={() => validateLeave(r.id, false)}
                              className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded disabled:opacity-50">
                        {t('reject') || 'Refuser'}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* History + new request */}
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">{t('leaveHistory') || 'Mes congés'}</span>
                <button onClick={() => setShowLeaveForm(v => !v)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded">
                  + {t('leaveNew') || 'Nouvelle demande'}
                </button>
              </div>

              {showLeaveForm && (
                <div className="p-4 border-b bg-gray-50 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">{t('leaveType') || 'Type'}</label>
                      <select className="w-full border rounded px-2 py-1.5 text-sm" value={leaveForm.type} onChange={e => setLeaveForm(f => ({ ...f, type: e.target.value }))}>
                        <option value="annual">{t('leaveAnnual') || 'Congé annuel'}</option>
                        <option value="sick">{t('leaveSick') || 'Congé maladie'}</option>
                        <option value="other">{t('leaveOther') || 'Autre'}</option>
                      </select>
                    </div>
                    <div />
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">{t('from') || 'Du'}</label>
                      <input type="date" className="w-full border rounded px-2 py-1.5 text-sm" value={leaveForm.start_date} onChange={e => setLeaveForm(f => ({ ...f, start_date: e.target.value }))} />
                      <select className="w-full border rounded px-2 py-1 text-xs mt-1" value={leaveForm.start_fraction} onChange={e => setLeaveForm(f => ({ ...f, start_fraction: e.target.value }))}>
                        <option value="full">{t('leaveFull') || 'Journée'}</option><option value="am">{t('leaveAm') || 'Matin'}</option><option value="pm">{t('leavePm') || 'Après-midi'}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">{t('to') || 'Au'}</label>
                      <input type="date" className="w-full border rounded px-2 py-1.5 text-sm" min={leaveForm.start_date} value={leaveForm.end_date} onChange={e => setLeaveForm(f => ({ ...f, end_date: e.target.value }))} />
                      {leaveForm.start_date !== leaveForm.end_date && (
                        <select className="w-full border rounded px-2 py-1 text-xs mt-1" value={leaveForm.end_fraction} onChange={e => setLeaveForm(f => ({ ...f, end_fraction: e.target.value }))}>
                          <option value="full">{t('leaveFull') || 'Journée'}</option><option value="am">{t('leaveAm') || 'Matin'}</option><option value="pm">{t('leavePm') || 'Après-midi'}</option>
                        </select>
                      )}
                    </div>
                  </div>
                  <textarea className="w-full border rounded px-2 py-1.5 text-sm" rows={2} placeholder={t('leaveReason') || 'Motif'} value={leaveForm.reason} onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))} />
                  <div className="flex justify-end">
                    <button disabled={submitting} onClick={submitLeave} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50">
                      {submitting ? '…' : (t('leaveCreate') || 'Créer')}
                    </button>
                  </div>
                </div>
              )}

              {leaveRequests.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-400 text-sm">{t('leaveNoRequests') || 'Aucune demande.'}</div>
              ) : (
                <ul className="divide-y">
                  {leaveRequests.map(r => (
                    <li key={r.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          {r.start_date}{r.end_date !== r.start_date ? ` → ${r.end_date}` : ''}
                          <span className="ml-2 text-xs text-gray-500">{fmtDays(r.working_days)} {t('days') || 'j'}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {t({ annual: 'leaveAnnual', sick: 'leaveSick', other: 'leaveOther' }[r.type]) || r.type}
                          {r.reason ? ` · ${r.reason}` : ''}
                        </div>
                      </div>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        r.status === 'pending'  ? 'bg-amber-100 text-amber-800' :
                        r.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                        {t('leaveSt' + r.status.charAt(0).toUpperCase() + r.status.slice(1)) || r.status}
                      </span>
                      {r.needs_signature ? (
                        <button disabled={signingId === r.id} onClick={() => signLeave(r.id)}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded disabled:opacity-50">
                          {signingId === r.id ? '…' : (t('leaveSign') || 'Signer')}
                        </button>
                      ) : r.employee_signed_at ? (
                        <span className="text-xs text-emerald-600">{t('leaveSigned') || 'Signé'}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {loading && <div className="text-sm text-gray-400 text-center">{t('loading') || 'Chargement…'}</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}
      </main>
    </div>
  );
}

function DayList({ punchesByDay, t, singleDay = null }) {
  let entries = Array.from(punchesByDay.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  if (singleDay) entries = entries.filter(([d]) => d === singleDay);

  if (entries.length === 0) {
    return <div className="bg-white border rounded-lg p-8 text-center text-gray-400 text-sm">{t('noData') || 'Aucune donnée'}</div>;
  }

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
          <tr>
            <th className="px-3 py-2 text-left">{t('date') || 'Date'}</th>
            <th className="px-3 py-2 text-left">{t('firstIn') || 'Première entrée'}</th>
            <th className="px-3 py-2 text-left">{t('lastOut') || 'Dernière sortie'}</th>
            <th className="px-3 py-2 text-right">{t('worked') || 'Travail'}</th>
            <th className="px-3 py-2 text-center">{t('punches') || 'Pointages'}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([day, items]) => {
            const s = summarizePunches(items, new Date());
            return (
              <tr key={day} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2 font-mono">{day}</td>
                <td className="px-3 py-2 font-mono">{s.firstIn ? s.firstIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td className="px-3 py-2 font-mono">{s.lastOut && !s.stillIn ? s.lastOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtMin(s.total)}</td>
                <td className="px-3 py-2 text-center text-xs text-gray-600">{items.length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
