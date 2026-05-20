import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Search } from 'lucide-react';
import api from '../services/api';

const methodColor = {
  POST:   'bg-green-100 text-green-700',
  PUT:    'bg-blue-100 text-blue-700',
  PATCH:  'bg-indigo-100 text-indigo-700',
  DELETE: 'bg-red-100 text-red-700',
};

const statusColor = (s) => {
  if (s == null) return 'text-gray-400';
  if (s < 300)  return 'text-green-700';
  if (s < 400)  return 'text-blue-700';
  if (s < 500)  return 'text-amber-700';
  return 'text-red-700';
};

export default function AuditLog() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ method: '', username: '', path_contains: '' });
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
      if (filters.method) qs.set('method', filters.method);
      if (filters.username) qs.set('username', filters.username);
      if (filters.path_contains) qs.set('path_contains', filters.path_contains);
      const res = await api.get(`/audit-log?${qs.toString()}`);
      setRows(res.data?.items || []);
      setTotal(res.data?.total || 0);
    } catch (e) {
      console.error('audit log load failed', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('auditLog') || "Journal d'audit"}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('auditLogDesc') || "Toutes les actions d'administration (création, modification, suppression)."}
          </p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {t('refresh') || 'Rafraîchir'}
        </button>
      </div>

      <div className="bg-white border rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('method') || 'Méthode'}</label>
          <select value={filters.method} onChange={(e) => { setPage(0); setFilters({ ...filters, method: e.target.value }); }}
                  className="w-full px-2 py-1.5 border rounded text-sm">
            <option value="">-</option>
            <option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('user') || 'Utilisateur'}</label>
          <input value={filters.username} onChange={(e) => setFilters({ ...filters, username: e.target.value })}
                 onKeyDown={(e) => e.key === 'Enter' && (setPage(0), load())}
                 className="w-full px-2 py-1.5 border rounded text-sm" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('path') || 'Chemin contient'}</label>
          <div className="relative">
            <Search className="absolute left-2 top-2 w-4 h-4 text-gray-400" />
            <input value={filters.path_contains} onChange={(e) => setFilters({ ...filters, path_contains: e.target.value })}
                   onKeyDown={(e) => e.key === 'Enter' && (setPage(0), load())}
                   placeholder="/api/devices"
                   className="w-full pl-8 pr-2 py-1.5 border rounded text-sm" />
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b text-xs text-gray-600 uppercase">
            <tr>
              <th className="px-3 py-2 text-left">{t('date') || 'Date'}</th>
              <th className="px-3 py-2 text-left">{t('user') || 'Utilisateur'}</th>
              <th className="px-3 py-2 text-left">IP</th>
              <th className="px-3 py-2 text-left">{t('method') || 'Méthode'}</th>
              <th className="px-3 py-2 text-left">{t('path') || 'Chemin'}</th>
              <th className="px-3 py-2 text-center">{t('status') || 'Statut'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <React.Fragment key={r.id}>
                <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">{r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</td>
                  <td className="px-3 py-2">{r.username || <span className="text-gray-400 italic">anonyme</span>}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-600">{r.ip || '-'}</td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${methodColor[r.method] || 'bg-gray-100'}`}>{r.method}</span></td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">{r.path}</td>
                  <td className={`px-3 py-2 text-center font-mono ${statusColor(r.status_code)}`}>{r.status_code ?? '-'}</td>
                </tr>
                {expanded === r.id && r.payload && (
                  <tr><td colSpan={6} className="bg-gray-50 px-6 py-3">
                    <pre className="text-xs whitespace-pre-wrap break-all text-gray-700">{r.payload}</pre>
                  </td></tr>
                )}
              </React.Fragment>
            ))}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={6} className="px-3 py-12 text-center text-gray-400">{t('noData') || 'Aucune donnée'}</td></tr>
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
