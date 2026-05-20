import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, EyeOff, RefreshCw, ScanSearch } from 'lucide-react';
import api from '../services/api';

const KIND_LABELS = {
  future_timestamp: 'Timestamp futur',
  before_hire:      'Avant embauche',
  inactive_employee:'Employé inactif',
  unmatched_user:   'UID sans employé',
  odd_hours:        'Heures inhabituelles',
  orphan_in:        'Entrée sans sortie',
  orphan_out:       'Sortie sans entrée',
  huge_gap:         'Écart > 14h',
  multi_device:     'Plusieurs appareils',
};

const SEV = {
  info:     'bg-blue-100 text-blue-700',
  warn:     'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
};

export default function AnomalyInbox() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('open');
  const [kindFilter, setKindFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [summary, setSummary] = useState({ open_total: 0, by_kind: {} });
  const limit = 100;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ status: statusFilter, limit: String(limit), offset: String(page * limit) });
      if (kindFilter) qs.set('kind', kindFilter);
      const [res, sumRes] = await Promise.all([
        api.get(`/anomalies?${qs.toString()}`),
        api.get('/anomalies/summary'),
      ]);
      setItems(res.data?.items || []);
      setTotal(res.data?.total || 0);
      setSummary(sumRes.data || { open_total: 0, by_kind: {} });
    } catch (e) {
      console.error('anomalies load failed', e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, kindFilter, page]);

  useEffect(() => { load(); }, [load]);

  const resolve = async (id, status) => {
    try {
      await api.put(`/anomalies/${id}`, { status });
      load();
    } catch (e) { console.error(e); }
  };

  const rescan = async () => {
    setLoading(true);
    try {
      await api.post('/anomalies/scan?hours=168', null);
      load();
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('anomalyInbox') || "Anomalies"}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('anomalyInboxDesc') || "Pointages signalés par les contrôles d'intégrité — à examiner."}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={rescan} className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">
            <ScanSearch className="w-4 h-4" /> {t('rescan') || 'Re-scanner 7j'}
          </button>
          <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {t('refresh') || 'Rafraîchir'}
          </button>
        </div>
      </div>

      {/* Counts per kind */}
      <div className="bg-white border rounded-lg p-4 flex flex-wrap gap-2">
        <button onClick={() => { setKindFilter(''); setPage(0); }}
                className={`px-3 py-1 rounded-full text-xs font-medium border ${kindFilter === '' ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}>
          {t('all') || 'Tous'} ({summary.open_total})
        </button>
        {Object.entries(summary.by_kind).map(([k, n]) => (
          <button key={k} onClick={() => { setKindFilter(k); setPage(0); }}
                  className={`px-3 py-1 rounded-full text-xs font-medium border ${kindFilter === k ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}>
            {KIND_LABELS[k] || k} ({n})
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex gap-2 text-sm">
        {['open', 'ack', 'ignored', 'resolved', 'all'].map((s) => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(0); }}
                  className={`px-3 py-1.5 rounded border ${statusFilter === s ? 'bg-primary-600 text-white border-primary-600' : 'hover:bg-gray-50'}`}>
            {t(`anomalyStatus_${s}`) || s}
          </button>
        ))}
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b text-xs text-gray-600 uppercase">
            <tr>
              <th className="px-3 py-2 text-left">{t('kind') || 'Type'}</th>
              <th className="px-3 py-2 text-left">{t('severity') || 'Gravité'}</th>
              <th className="px-3 py-2 text-left">{t('employee') || 'Employé'}</th>
              <th className="px-3 py-2 text-left">{t('device') || 'Appareil'}</th>
              <th className="px-3 py-2 text-left">{t('day') || 'Jour'}</th>
              <th className="px-3 py-2 text-left">{t('detail') || 'Détail'}</th>
              <th className="px-3 py-2 text-center">{t('actions') || 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {items.map(a => (
              <tr key={a.id} className="border-b hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">{KIND_LABELS[a.kind] || a.kind}</td>
                <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs ${SEV[a.severity] || ''}`}>{a.severity}</span></td>
                <td className="px-3 py-2">{a.employee_name || <span className="text-gray-400">—</span>}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{a.device_name || a.device_id || '—'}</td>
                <td className="px-3 py-2 font-mono text-xs">{a.day || '—'}</td>
                <td className="px-3 py-2 text-xs text-gray-700">{a.detail}</td>
                <td className="px-3 py-2 text-center">
                  {a.status === 'open' ? (
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => resolve(a.id, 'ack')} title={t('acknowledge') || 'Accuser réception'}
                              className="p-1 hover:bg-blue-100 rounded"><CheckCircle className="w-4 h-4 text-blue-600" /></button>
                      <button onClick={() => resolve(a.id, 'ignored')} title={t('ignore') || 'Ignorer'}
                              className="p-1 hover:bg-gray-100 rounded"><EyeOff className="w-4 h-4 text-gray-500" /></button>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-500">{a.status}</span>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr><td colSpan={7} className="px-3 py-12 text-center text-gray-400">{t('noAnomalies') || 'Aucune anomalie'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center text-sm">
        <span className="text-gray-500">{total} {t('records') || 'entrées'}</span>
        <div className="flex gap-2">
          <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="px-3 py-1 border rounded disabled:opacity-50">←</button>
          <span className="px-2 py-1">{page + 1} / {Math.max(1, Math.ceil(total / limit))}</span>
          <button disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-50">→</button>
        </div>
      </div>
    </div>
  );
}
