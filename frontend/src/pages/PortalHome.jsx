import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, Clock, Calendar, CheckCircle, AlertCircle } from 'lucide-react';

const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('portal_token') || ''}` });

const fmtMin = (m) => {
  if (!m) return '0h00';
  const h = Math.floor(m / 60); const mm = m % 60;
  return `${h}h${String(mm).padStart(2, '0')}`;
};

export default function PortalHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const today = new Date();
  const [me, setMe] = useState(null);
  const [punches, setPunches] = useState([]);
  const [monthly, setMonthly] = useState(null);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('portal_token');
    if (!t) { navigate('/portal-login'); return; }
    (async () => {
      try {
        const meRes = await fetch('/api/portal/me', { headers: auth() });
        if (meRes.status === 401) { navigate('/portal-login'); return; }
        setMe(await meRes.json());

        const firstOfMonth = new Date(year, month - 1, 1).toISOString().slice(0, 10);
        const endOfMonth = new Date(year, month, 0).toISOString().slice(0, 10);

        const [pRes, mRes] = await Promise.all([
          fetch(`/api/portal/punches?start_date=${firstOfMonth}&end_date=${endOfMonth}`, { headers: auth() }),
          fetch(`/api/portal/month-summary?year=${year}&month=${month}`, { headers: auth() }),
        ]);
        setPunches(await pRes.json());
        setMonthly(await mRes.json());
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [year, month, navigate]);

  const logout = () => {
    localStorage.removeItem('portal_token');
    localStorage.removeItem('portal_employee');
    navigate('/portal-login');
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">{t('loading') || 'Chargement...'}</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">{me?.matricule}</div>
            <div className="font-semibold text-gray-900">{me?.name}</div>
            {me?.department && <div className="text-xs text-gray-500">{me.department}</div>}
          </div>
          <button onClick={logout} className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-red-600">
            <LogOut className="w-4 h-4" /> {t('logout') || 'Déconnexion'}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Month picker */}
        <div className="bg-white rounded-lg border p-4 flex flex-wrap gap-3 items-end">
          <Calendar className="w-5 h-5 text-primary-600" />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('year') || 'Année'}</label>
            <input type="number" min="2020" max="2099" value={year} onChange={(e) => setYear(parseInt(e.target.value) || today.getFullYear())}
                   className="w-24 px-2 py-1.5 border rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('month') || 'Mois'}</label>
            <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="px-2 py-1.5 border rounded text-sm">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
            </select>
          </div>
        </div>

        {/* Totals */}
        {monthly && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: t('daysWorked') || 'Jours', value: monthly.totals.days, icon: Calendar, color: 'text-blue-600' },
              { label: t('worked') || 'Travail', value: fmtMin(monthly.totals.worked), icon: Clock, color: 'text-emerald-600' },
              { label: t('overtime') || 'Sup.', value: fmtMin(monthly.totals.overtime), icon: Clock, color: 'text-purple-600' },
              { label: t('lateMin') || 'Retard', value: fmtMin(monthly.totals.late), icon: AlertCircle, color: 'text-amber-600' },
              { label: t('earlyMin') || 'Dép. ant.', value: fmtMin(monthly.totals.early), icon: AlertCircle, color: 'text-orange-600' },
            ].map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="bg-white border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <Icon className={`w-5 h-5 ${s.color}`} />
                    <span className="text-xs text-gray-500">{s.label}</span>
                  </div>
                  <div className="text-xl font-semibold mt-1">{s.value}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Punches table */}
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2"><Clock className="w-5 h-5 text-primary-600" /> {t('myPunches') || 'Mes pointages'}</h2>
            <span className="text-xs text-gray-500">{punches.length} {t('records') || 'entrées'}</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">{t('date') || 'Date'}</th>
                <th className="px-3 py-2 text-left">{t('time') || 'Heure'}</th>
                <th className="px-3 py-2 text-left">{t('punchType') || 'Type'}</th>
                <th className="px-3 py-2 text-left">{t('source') || 'Source'}</th>
              </tr>
            </thead>
            <tbody>
              {punches.map((p) => {
                const d = new Date(p.timestamp);
                const isIn = p.punch === 0;
                return (
                  <tr key={p.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono">{d.toLocaleDateString()}</td>
                    <td className="px-3 py-2 font-mono">{d.toLocaleTimeString()}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${isIn ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {isIn ? (t('checkIn') || 'Entrée') : (t('checkOut') || 'Sortie')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{p.source}</td>
                  </tr>
                );
              })}
              {punches.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">{t('noData') || 'Aucune donnée'}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}
      </main>
    </div>
  );
}
