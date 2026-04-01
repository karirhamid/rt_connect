import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Filter, Download, FileText, Loader, Users, Clock, CalendarDays, Search, BarChart3 } from 'lucide-react';
import api from '../services/api';

export default function Reports() {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState('range');
  const [date, setDate] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [devices, setDevices] = useState([]);
  const [groupBy, setGroupBy] = useState('employee'); // 'none' | 'date' | 'employee'
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(null); // 'csv' | 'pdf' | null
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState([]);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'details'
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDate(today);
    setFrom(today);
    setTo(today);
    // Load devices for filter
    api.getDevices().then(data => {
      setDevices(Array.isArray(data) ? data : data?.devices || []);
    }).catch(() => {});
  }, []);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (mode === 'day' && date) params.append('date', date);
    if (mode === 'range') {
      if (from) params.append('start_date', from);
      if (to) params.append('end_date', to);
    }
    if (employeeName.trim()) params.append('employee_name', employeeName.trim());
    if (deviceId) params.append('device_id', deviceId);
    return params;
  }, [mode, date, from, to, employeeName, deviceId]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const params = buildParams();
      const [recResp, sumResp] = await Promise.all([
        api.authFetch(`/api/reports/attendance/records?${params}`, { method: 'GET' }),
        api.authFetch(`/api/reports/attendance/summary?${params}`, { method: 'GET' }),
      ]);
      if (!recResp.ok) {
        const err = await recResp.json().catch(() => ({}));
        throw new Error(err.detail || t('failedToLoadRecords'));
      }
      if (!sumResp.ok) {
        const err = await sumResp.json().catch(() => ({}));
        throw new Error(err.detail || t('failedToLoadSummary'));
      }
      const [recData, sumData] = await Promise.all([recResp.json(), sumResp.json()]);
      setRecords(recData.records || []);
      setSummary(sumData.summary || []);
    } catch (e) {
      setError(e?.message || t('failedToLoadReport'));
      setRecords([]);
      setSummary([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') fetchData();
  };

  const exportCSV = async () => {
    setExporting('csv');
    try {
      const params = buildParams();
      const resp = await api.authFetch(`/api/reports/attendance/export.csv?${params}`, { method: 'GET' });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || t('exportFailed'));
      }
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `attendance_${mode === 'day' ? date : `${from}_${to}`}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.message || t('exportFailed'));
    } finally {
      setExporting(null);
    }
  };

  const exportPDF = async () => {
    setExporting('pdf');
    try {
      const params = buildParams();
      params.append('lang', i18n.language || 'en');
      if (groupBy && groupBy !== 'none') params.append('group_by', groupBy);
      const resp = await api.authFetch(`/api/reports/attendance/export.pdf?${params}`, { method: 'GET' });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || t('exportFailed'));
      }
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `attendance_${mode === 'day' ? date : `${from}_${to}`}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.message || t('exportFailed'));
    } finally {
      setExporting(null);
    }
  };

  // Stats cards
  const uniqueEmployees = new Set(summary.map(r => r.employee_name)).size;
  const totalSwipes = summary.reduce((s, r) => s + r.swipes, 0);
  const uniqueDays = new Set(summary.map(r => r.date)).size;

  // ── Grouping logic ──
  const groupData = (data, key) => {
    const map = new Map();
    data.forEach(item => {
      const groupKey = key === 'employee' ? (item.employee_name || 'Unknown') : (item.date || 'Unknown');
      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey).push(item);
    });
    return Array.from(map.entries()); // [[groupKey, [items]], ...]
  };

  const groupedSummary = groupBy !== 'none' ? groupData(summary, groupBy) : null;
  const groupedRecords = groupBy !== 'none' ? groupData(records, groupBy) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{t('reports')}</h1>
        <p className="text-sm text-gray-500">{t('generateReport')}</p>
      </div>

      {/* Filters Card */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-4 space-y-4">
          {/* Row 1: Mode toggle + Date inputs */}
          <div className="flex flex-wrap gap-3 items-end">
            {/* Mode toggle */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('reportMode') || 'Mode'}</label>
              <div className="inline-flex rounded-lg border overflow-hidden">
                <button
                  onClick={() => setMode('day')}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    mode === 'day'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t('byDay')}
                </button>
                <button
                  onClick={() => setMode('range')}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    mode === 'range'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t('dateRange')}
                </button>
              </div>
            </div>

            {/* Date inputs */}
            {mode === 'day' ? (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('date')}</label>
                <input
                  type="date"
                  className="border rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('from')}</label>
                  <input
                    type="date"
                    className="border rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
                    value={from}
                    onChange={e => setFrom(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('to')}</label>
                  <input
                    type="date"
                    className="border rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
                    value={to}
                    onChange={e => setTo(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                </div>
              </>
            )}

            {/* Employee name */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('employeeName')}</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  className="border rounded-lg pl-8 pr-3 py-2 text-sm bg-white text-gray-900 w-44"
                  value={employeeName}
                  onChange={e => setEmployeeName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('searchEmployee') || 'Search...'}
                />
              </div>
            </div>

            {/* Device filter */}
            {devices.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('device')}</label>
                <select
                  className="border rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
                  value={deviceId}
                  onChange={e => setDeviceId(e.target.value)}
                >
                  <option value="">{t('allDevices') || 'All Devices'}</option>
                  {devices.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.ip})</option>
                  ))}
                </select>
              </div>
            )}

            {/* Group by */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('groupBy') || 'Group by'}</label>
              <select
                className="border rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
                value={groupBy}
                onChange={e => setGroupBy(e.target.value)}
              >
                <option value="employee">{t('groupByEmployee') || 'By Employee'}</option>
                <option value="date">{t('groupByDate') || 'By Date'}</option>
                <option value="none">{t('groupByNone') || 'No grouping'}</option>
              </select>
            </div>
          </div>

          {/* Row 2: Action buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
            <button
              onClick={fetchData}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
              {t('generateReport')}
            </button>

            <div className="w-px h-6 bg-gray-200 mx-1" />

            <button
              onClick={exportCSV}
              disabled={!!exporting || loading}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 text-gray-700 disabled:opacity-50 transition-colors"
            >
              {exporting === 'csv' ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              CSV
            </button>
            <button
              onClick={exportPDF}
              disabled={!!exporting || loading}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 text-gray-700 disabled:opacity-50 transition-colors"
            >
              {exporting === 'pdf' ? <Loader className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              PDF
            </button>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>
          )}
        </div>
      </div>

      {/* Stats Cards — only after search */}
      {hasSearched && !loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{records.length}</div>
                <div className="text-xs text-gray-500">{t('totalRecords') || 'Total Records'}</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{uniqueEmployees}</div>
                <div className="text-xs text-gray-500">{t('employees')}</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                <CalendarDays className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{uniqueDays}</div>
                <div className="text-xs text-gray-500">{t('days') || 'Days'}</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{totalSwipes}</div>
                <div className="text-xs text-gray-500">{t('totalSwipes') || 'Total Swipes'}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      {hasSearched && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('summary')}
              className={`px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === 'summary'
                  ? 'border-b-2 border-primary-600 text-primary-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t('summary')} ({summary.length})
            </button>
            <button
              onClick={() => setActiveTab('details')}
              className={`px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === 'details'
                  ? 'border-b-2 border-primary-600 text-primary-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t('detailedRecords')} ({records.length})
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
              <Loader className="w-5 h-5 animate-spin" />
              <span className="text-sm">{t('loading')}...</span>
            </div>
          ) : activeTab === 'summary' ? (
            /* ── Summary Table ── */
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3">{t('date')}</th>
                    <th className="px-4 py-3">{t('employeeName')}</th>
                    <th className="px-4 py-3">{t('department')}</th>
                    <th className="px-4 py-3">{t('firstCheckIn')}</th>
                    <th className="px-4 py-3">{t('lastCheckOut')}</th>
                    <th className="px-4 py-3 text-center">{t('swipes') || 'Swipes'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {groupedSummary ? (
                    groupedSummary.map(([group, items]) => (
                      <React.Fragment key={group}>
                        <tr className="bg-primary-50/60">
                          <td colSpan={6} className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-primary-800 text-sm">{group}</span>
                              <span className="text-xs text-primary-500 bg-primary-100 px-2 py-0.5 rounded-full">{items.length} {items.length === 1 ? t('record') || 'record' : t('records') || 'records'}</span>
                              <span className="text-xs text-gray-500 ml-auto">{t('totalSwipes') || 'Total swipes'}: {items.reduce((s, r) => s + r.swipes, 0)}</span>
                            </div>
                          </td>
                        </tr>
                        {items.map((r, idx) => (
                          <tr key={`${group}-${idx}`} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-2.5 font-mono text-gray-700">{r.date}</td>
                            <td className="px-4 py-2.5 font-medium text-gray-900">{r.employee_name}</td>
                            <td className="px-4 py-2.5 text-gray-600">{r.department}</td>
                            <td className="px-4 py-2.5">
                              {r.first_check_in ? (
                                <span className="inline-flex items-center gap-1 text-green-700">
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                  {new Date(r.first_check_in).toLocaleTimeString()}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              {r.last_check_out ? (
                                <span className="inline-flex items-center gap-1 text-red-600">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                  {new Date(r.last_check_out).toLocaleTimeString()}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                                {r.swipes}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))
                  ) : (
                    summary.map((r, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-gray-700">{r.date}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-900">{r.employee_name}</td>
                        <td className="px-4 py-2.5 text-gray-600">{r.department}</td>
                        <td className="px-4 py-2.5">
                          {r.first_check_in ? (
                            <span className="inline-flex items-center gap-1 text-green-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                              {new Date(r.first_check_in).toLocaleTimeString()}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {r.last_check_out ? (
                            <span className="inline-flex items-center gap-1 text-red-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                              {new Date(r.last_check_out).toLocaleTimeString()}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                            {r.swipes}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                  {summary.length === 0 && (
                    <tr>
                      <td className="px-4 py-12 text-center text-gray-400" colSpan={6}>
                        {t('noData')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* ── Detailed Records Table ── */
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3">{t('date')}</th>
                    <th className="px-4 py-3">{t('time')}</th>
                    <th className="px-4 py-3">{t('employeeName')}</th>
                    <th className="px-4 py-3">{t('department')}</th>
                    <th className="px-4 py-3">{t('device')}</th>
                    <th className="px-4 py-3">{t('type') || 'Type'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {groupedRecords ? (
                    groupedRecords.map(([group, items]) => (
                      <React.Fragment key={group}>
                        <tr className="bg-primary-50/60">
                          <td colSpan={6} className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-primary-800 text-sm">{group}</span>
                              <span className="text-xs text-primary-500 bg-primary-100 px-2 py-0.5 rounded-full">{items.length} {items.length === 1 ? t('record') || 'record' : t('records') || 'records'}</span>
                            </div>
                          </td>
                        </tr>
                        {items.map(r => (
                          <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-2.5 font-mono text-gray-700">{r.date}</td>
                            <td className="px-4 py-2.5 font-mono text-gray-700">{r.time}</td>
                            <td className="px-4 py-2.5 font-medium text-gray-900">{r.employee_name}</td>
                            <td className="px-4 py-2.5 text-gray-600">{r.department}</td>
                            <td className="px-4 py-2.5 text-gray-600">{r.device_name}</td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                                r.punch === 0
                                  ? 'bg-green-100 text-green-700'
                                  : r.punch === 1
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-600'
                              }`}>
                                {r.punch === 0 ? (t('checkIn') || 'In') : r.punch === 1 ? (t('checkOut') || 'Out') : `#${r.punch}`}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))
                  ) : (
                    records.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-gray-700">{r.date}</td>
                        <td className="px-4 py-2.5 font-mono text-gray-700">{r.time}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-900">{r.employee_name}</td>
                        <td className="px-4 py-2.5 text-gray-600">{r.department}</td>
                        <td className="px-4 py-2.5 text-gray-600">{r.device_name}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            r.punch === 0
                              ? 'bg-green-100 text-green-700'
                              : r.punch === 1
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-600'
                          }`}>
                            {r.punch === 0 ? (t('checkIn') || 'In') : r.punch === 1 ? (t('checkOut') || 'Out') : `#${r.punch}`}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                  {records.length === 0 && (
                    <tr>
                      <td className="px-4 py-12 text-center text-gray-400" colSpan={6}>
                        {t('noData')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Initial empty state */}
      {!hasSearched && (
        <div className="bg-white rounded-xl border p-12 text-center">
          <BarChart3 className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-sm">{t('selectFiltersAndGenerate') || 'Select filters and click Generate Report'}</p>
        </div>
      )}
    </div>
  );
}
