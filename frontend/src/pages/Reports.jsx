import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Filter, Download, FileText, Loader, Users, Clock, CalendarDays, Search, BarChart3, AlertTriangle } from 'lucide-react';
import api from '../services/api';

const PUNCH_CATEGORY_STYLES = {
  entry:         { bg: 'bg-green-100', text: 'text-green-800', key: 'punchEntry' },
  break_out:     { bg: 'bg-amber-100', text: 'text-amber-800', key: 'punchBreakOut' },
  break_in:      { bg: 'bg-cyan-100',  text: 'text-cyan-800',  key: 'punchBreakIn' },
  exit:          { bg: 'bg-blue-100',  text: 'text-blue-800',  key: 'punchExit' },
  overtime_exit: { bg: 'bg-purple-100',text: 'text-purple-800',key: 'punchOvertimeExit' },
  unknown:       { bg: 'bg-gray-100',  text: 'text-gray-600',  key: 'punchUnknown' },
};

export default function Reports() {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState('range');
  const [date, setDate] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [devices, setDevices] = useState([]);
  const [groupBy, setGroupBy] = useState(''); // '' | 'employee' | 'date' | 'department'
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(null); // 'csv' | 'pdf' | null
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState([]);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'details' | 'lateness'
  const [hasSearched, setHasSearched] = useState(false);
  const [attendanceMode, setAttendanceMode] = useState('simple');
  const [employeeMode, setEmployeeMode] = useState('shared');

  // Lateness module (optional, super-admin-toggled)
  const [latenessModuleOn, setLatenessModuleOn] = useState(false);
  // Report type drives the whole flow: normal/with_lateness use the existing
  // summary+records endpoints; lateness_only swaps the on-screen table for
  // the ranking endpoint and the PDF button for the ranking PDF.
  const [reportType, setReportType] = useState('normal'); // normal | with_lateness | lateness_only
  const [latenessRanking, setLatenessRanking] = useState([]);
  // Multi-employee chip picker — applies to all three report types.
  const [employeesAll, setEmployeesAll] = useState([]); // [{ id, user_id, name, ... }]
  const [selectedEmployees, setSelectedEmployees] = useState([]); // matricules (user_id strings)
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDate(today);
    setFrom(today);
    setTo(today);
    // Load devices for filter
    api.getDevices().then(data => {
      setDevices(Array.isArray(data) ? data : data?.devices || []);
    }).catch(() => {});

    // Load employees for the multi-select chip picker (used by all 3 report types)
    api.getEmployees().then(data => {
      const list = Array.isArray(data) ? data : (data?.employees || []);
      setEmployeesAll(list);
    }).catch(() => {});

    // Probe lateness module flag — hides/shows the 'Avec retards' /
    // 'Retards uniquement' options. Public endpoint, no auth required.
    fetch('/api/settings/reports-module/public')
      .then(r => r.ok ? r.json() : { lateness_module_enabled: false })
      .then(d => setLatenessModuleOn(!!d.lateness_module_enabled))
      .catch(() => setLatenessModuleOn(false));
  }, []);

  // Reset report type to 'normal' if the module gets turned off mid-session
  useEffect(() => {
    if (!latenessModuleOn && reportType !== 'normal') setReportType('normal');
  }, [latenessModuleOn, reportType]);

  const fmtLateMin = (m) => {
    m = Number(m || 0);
    if (m <= 0) return '—';
    const h = Math.floor(m / 60); const r = m % 60;
    return h > 0 ? `${h}h${r ? String(r).padStart(2,'0') : ''}` : `${r}m`;
  };

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (mode === 'day' && date) params.append('date', date);
    if (mode === 'range') {
      if (from) params.append('start_date', from);
      if (to) params.append('end_date', to);
    }
    if (employeeName.trim()) params.append('employee_name', employeeName.trim());
    if (selectedEmployees.length) params.append('employee_ids', selectedEmployees.join(','));
    if (deviceId) params.append('device_id', deviceId);
    if (reportType === 'with_lateness') params.append('with_lateness', 'true');
    return params;
  }, [mode, date, from, to, employeeName, deviceId, selectedEmployees, reportType]);

  // For the ranking endpoints — same date/device/employee filters, but the
  // range endpoint expects start_date+end_date (no 'date' singleton).
  const buildRankingParams = useCallback(() => {
    const params = new URLSearchParams();
    if (mode === 'day' && date) { params.append('start_date', date); params.append('end_date', date); }
    else { if (from) params.append('start_date', from); if (to) params.append('end_date', to); }
    if (deviceId) params.append('device_id', deviceId);
    if (selectedEmployees.length) params.append('employee_ids', selectedEmployees.join(','));
    return params;
  }, [mode, date, from, to, deviceId, selectedEmployees]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      if (reportType === 'lateness_only') {
        // Ranking-only flow: one call, no summary/records.
        const params = buildRankingParams();
        const resp = await api.authFetch(`/api/reports/lateness/ranking?${params}`, { method: 'GET' });
        if (resp.status === 403) {
          // Module was turned off — bounce back to Normal mode
          setLatenessModuleOn(false);
          setReportType('normal');
          throw new Error(t('latenessModuleDisabledMsg') || 'Module Retards désactivé. Activez-le dans Paramètres → Rapports.');
        }
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.detail || 'lateness fetch failed');
        }
        const data = await resp.json();
        setLatenessRanking(data.ranking || []);
        setRecords([]); setSummary([]);
        setActiveTab('summary');  // tab bar is hidden in this mode; reset for next time
        return;
      }

      // Normal + with_lateness — same data path, optional retard column.
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
      setAttendanceMode(sumData.attendance_mode || 'simple');
      setEmployeeMode(sumData.employee_mode || 'shared');
    } catch (e) {
      setError(e?.message || t('failedToLoadReport'));
      setRecords([]);
      setSummary([]);
      setLatenessRanking([]);
    } finally {
      setLoading(false);
    }
  };

  // Convenience: does the on-screen table need a Retard column?
  const showLateCol = reportType === 'with_lateness' || attendanceMode === 'strict';

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
      let url, filename;
      if (reportType === 'lateness_only') {
        // Ranking PDF — single table, no group_by relevant here.
        const params = buildRankingParams();
        params.append('lang', (i18n.language || 'fr').slice(0, 2));
        const resp = await api.authFetch(`/api/reports/lateness/ranking/pdf?${params}`, { method: 'GET' });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.detail || t('exportFailed'));
        }
        url = window.URL.createObjectURL(new Blob([await resp.blob()], { type: 'application/pdf' }));
        filename = `lateness_ranking_${mode === 'day' ? date : `${from}_${to}`}.pdf`;
      } else {
        // Normal or 'Avec retards' — same endpoint, with_lateness already
        // in the query string thanks to buildParams.
        const params = buildParams();
        params.append('lang', i18n.language || 'en');
        if (effectiveGroupBy) params.append('group_by', effectiveGroupBy);
        const resp = await api.authFetch(`/api/reports/attendance/export.pdf?${params}`, { method: 'GET' });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.detail || t('exportFailed'));
        }
        url = window.URL.createObjectURL(new Blob([await resp.blob()], { type: 'application/pdf' }));
        filename = `${reportType === 'with_lateness' ? 'attendance_retards' : 'attendance'}_${mode === 'day' ? date : `${from}_${to}`}.pdf`;
      }
      const link = document.createElement('a');
      link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.message || t('exportFailed'));
    } finally {
      setExporting(null);
    }
  };

  // Stats cards
  const uniqueEmployees = new Set(summary.map(r => r.employee_id)).size;
  const totalSwipes = summary.reduce((s, r) => s + r.swipes, 0);
  const uniqueDays = new Set(summary.map(r => r.date)).size;

  // ── Grouping logic ──
  const groupData = (data, key) => {
    const map = new Map();
    data.forEach(item => {
      const groupKey =
        key === 'employee'   ? (item.employee_id || 'Unknown') :
        key === 'department' ? (item.department  || '-')        :
                               (item.date        || 'Unknown');
      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey).push(item);
    });
    return Array.from(map.entries());
  };

  const groupLabel = (key, group, items) => {
    if (key === 'employee') return items[0]?.employee_name || group;
    return group;
  };

  // Effective group_by — honours an explicit user choice first, otherwise
  // defaults to 'employee' when the 'Avec retards' report covers multiple
  // selected employees. That auto-default surfaces each person's own
  // 'Total retard' line without forcing the user to remember the dropdown.
  // The auto-default only fires when the user has NOT picked a grouping;
  // explicit 'By date' or 'By department' choices are respected.
  const effectiveGroupBy =
    groupBy
    || (reportType === 'with_lateness' && selectedEmployees.length > 1 ? 'employee' : '');
  const autoGroupApplied = !groupBy && effectiveGroupBy === 'employee';

  const groupedSummary = effectiveGroupBy ? groupData(summary, effectiveGroupBy) : null;
  const groupedRecords = effectiveGroupBy ? groupData(records, effectiveGroupBy) : null;

  const fmtMin = (m) => {
    if (m == null) return '-';
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h > 0 ? `${h}h${r > 0 ? String(r).padStart(2, '0') + 'm' : ''}` : `${r}m`;
  };

  // Punch source badge — shows when any punch in the row is non-device
  const SourceBadge = ({ sources }) => {
    if (!sources || sources.length === 0) return null;
    const nonDevice = sources.filter((s) => s && s !== 'device');
    if (nonDevice.length === 0) return null;
    const map = { manual: ['M', 'bg-blue-100 text-blue-700', t('sourceManual') || 'Manual entry'],
                  corrected: ['C', 'bg-amber-100 text-amber-700', t('sourceCorrected') || 'Corrected'],
                  imported: ['I', 'bg-purple-100 text-purple-700', t('sourceImported') || 'Imported'] };
    return (
      <span className="inline-flex gap-0.5 ml-1">
        {nonDevice.map((s) => {
          const cfg = map[s] || ['?', 'bg-gray-200 text-gray-700', s];
          return (
            <span key={s} className={`inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold ${cfg[1]}`} title={cfg[2]}>
              {cfg[0]}
            </span>
          );
        })}
      </span>
    );
  };

  // Column count for the summary table — used by group-header rows.
  // Base = 8 (Date, Employee, Dept, In, Out, TotalWorked, Overtime, Swipes).
  // +1 when the Retard column is shown (with_lateness or strict).
  // +1 when the Early dep column is shown (strict only).
  const colCount = 8 + (showLateCol ? 1 : 0) + (attendanceMode === 'strict' ? 1 : 0);

  return (
    <div className="space-y-6">
      {/* Header — stacks on mobile */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-gray-900">{t('reports')}</h1>
          <p className="text-sm text-gray-500">{t('generateReport')}</p>
        </div>
        {hasSearched && (
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              employeeMode === 'shared'
                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
            }`}>
              <Users className="w-3.5 h-3.5" />
              {employeeMode === 'shared' ? (t('employeeModeShared') || 'Shared') : (t('employeeModeSeparate') || 'Separate')}
            </span>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              attendanceMode === 'strict'
                ? 'bg-amber-100 text-amber-700 border border-amber-200'
                : 'bg-gray-100 text-gray-600 border border-gray-200'
            }`}>
              <Clock className="w-3.5 h-3.5" />
              {attendanceMode === 'strict' ? (t('attendanceModeStrict') || 'Strict') : (t('attendanceModeSimple') || 'Simple')}
            </span>
          </div>
        )}
      </div>

      {/* Filters Card */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-4 space-y-4">
          {/* Row 0: Report type selector (only shown when lateness module on) */}
          {latenessModuleOn && (
            <div className="flex flex-wrap gap-3 items-end pb-3 border-b border-dashed border-gray-200">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {t('reportType') || 'Type de rapport'}
                </label>
                <select
                  className="border rounded-lg px-3 py-2 text-sm bg-white text-gray-900 min-w-[15rem]"
                  value={reportType}
                  onChange={e => setReportType(e.target.value)}
                >
                  <option value="normal">{t('reportTypeNormal') || 'Normal'}</option>
                  <option value="with_lateness">{t('reportTypeWithLateness') || 'Avec retards'}</option>
                  <option value="lateness_only">{t('reportTypeLatenessOnly') || 'Retards uniquement'}</option>
                </select>
              </div>
              {reportType !== 'normal' && (
                <p className="text-xs text-gray-500 flex-1 pb-1.5">
                  {reportType === 'with_lateness'
                    ? (t('reportTypeWithLatenessHint') || 'Ajoute une colonne Retard et un total par groupe au rapport habituel.')
                    : (t('reportTypeLatenessOnlyHint') || 'Tableau dédié : un employé par ligne avec son total de retard sur la période.')}
                </p>
              )}
            </div>
          )}

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

            {/* Employee name (free-text contains match) */}
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

            {/* Multi-employee chip picker — only the BUTTON sits in the
                filters row so the row height stays constant. The selected
                chips render below the whole row (see further down) so adding
                a chip never pushes other inputs around. */}
            <div className="relative">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {t('employeesSelected') || 'Employés'} {selectedEmployees.length > 0 && `(${selectedEmployees.length})`}
              </label>
              <button
                type="button"
                onClick={() => setEmployeePickerOpen(o => !o)}
                className="border rounded-lg px-3 py-2 text-sm bg-white text-gray-700 hover:bg-gray-50 transition-colors inline-flex items-center gap-2 w-full sm:w-auto sm:min-w-[12rem]"
              >
                <Users className="w-4 h-4 text-gray-400 shrink-0" />
                {selectedEmployees.length === 0
                  ? (t('allEmployees') || 'Tous')
                  : `${selectedEmployees.length} ${t('selected') || 'sélectionné(s)'}`}
              </button>
              {employeePickerOpen && (
                <>
                  {/* Click-away catcher */}
                  <div className="fixed inset-0 z-20" onClick={() => setEmployeePickerOpen(false)} />
                  <div className="absolute z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] bg-white border border-gray-200 rounded-lg shadow-lg p-2 max-h-72 overflow-y-auto"
                       onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-2 py-1 text-xs text-gray-500">
                      <span>{employeesAll.length} {t('employees') || 'employés'}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedEmployees([])}
                        className="text-primary-600 hover:underline disabled:opacity-40"
                        disabled={selectedEmployees.length === 0}
                      >
                        {t('clear') || 'Effacer'}
                      </button>
                    </div>
                    <ul className="divide-y divide-gray-50">
                      {employeesAll.map(emp => {
                        const uid = emp.user_id || emp.id;
                        const checked = selectedEmployees.includes(uid);
                        return (
                          <li key={uid} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer"
                              onClick={() => {
                                setSelectedEmployees(prev =>
                                  checked ? prev.filter(x => x !== uid) : [...prev, uid]);
                              }}>
                            <input type="checkbox" readOnly checked={checked}
                                   className="w-4 h-4 text-primary-600 rounded"/>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-gray-900 truncate">{emp.name}</div>
                              <div className="text-xs text-gray-500 font-mono">{uid}</div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </>
              )}
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
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {t('groupBy') || 'Group by'}
                {autoGroupApplied && (
                  <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800"
                        title={t('groupByAutoHint') || "Grouping by employee enabled automatically because several employees are selected with 'Avec retards'. Pick a value to override."}>
                    {t('autoLabel') || 'auto'}
                  </span>
                )}
              </label>
              <select
                className="border rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
                value={groupBy}
                onChange={e => setGroupBy(e.target.value)}
              >
                <option value="">
                  {autoGroupApplied
                    ? (t('groupByNoneAutoEmployee') || 'No grouping (auto → Employee)')
                    : (t('groupByNone') || 'No grouping')}
                </option>
                <option value="employee">{t('groupByEmployee') || 'By Employee'}</option>
                <option value="date">{t('groupByDate') || 'By Date'}</option>
                <option value="department">{t('groupByDepartment') || 'By Department'}</option>
              </select>
            </div>
          </div>

          {/* Row 1.5: Selected-employee chips — its own row so adding a chip
              never shifts the inputs above. Renders only when selection is
              non-empty. */}
          {selectedEmployees.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 -mt-1">
              <span className="text-xs text-gray-500 mr-1 shrink-0">
                {t('employeesSelected') || 'Employés'} :
              </span>
              {selectedEmployees.slice(0, 12).map(uid => {
                const emp = employeesAll.find(e => (e.user_id || e.id) === uid);
                return (
                  <span key={uid}
                        className="inline-flex items-center gap-1 max-w-[14rem] px-2 py-0.5 rounded-full text-xs bg-primary-50 text-primary-700 border border-primary-100">
                    <span className="truncate">{emp?.name || uid}</span>
                    <button type="button"
                            onClick={() => setSelectedEmployees(prev => prev.filter(x => x !== uid))}
                            className="hover:text-primary-900 leading-none shrink-0"
                            aria-label="remove">×</button>
                  </span>
                );
              })}
              {selectedEmployees.length > 12 && (
                <span className="text-xs text-gray-500 px-1">+{selectedEmployees.length - 12}</span>
              )}
              <button type="button"
                      onClick={() => setSelectedEmployees([])}
                      className="ml-auto text-xs text-gray-500 hover:text-gray-700">
                {t('clear') || 'Effacer'}
              </button>
            </div>
          )}

          {/* Row 2: Action buttons — stack/wrap on phones */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
            <button
              onClick={fetchData}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors w-full sm:w-auto"
            >
              {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
              {t('generateReport')}
            </button>

            <div className="hidden sm:block w-px h-6 bg-gray-200 mx-1" />

            <button
              onClick={exportCSV}
              disabled={!!exporting || loading}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 text-gray-700 disabled:opacity-50 transition-colors flex-1 sm:flex-none"
            >
              {exporting === 'csv' ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              CSV
            </button>
            <button
              onClick={exportPDF}
              disabled={!!exporting || loading}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 text-gray-700 disabled:opacity-50 transition-colors flex-1 sm:flex-none"
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

      {/* Lateness-only ranking table — completely separate from Summary/Details */}
      {hasSearched && reportType === 'lateness_only' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-4 py-3 border-b bg-amber-50/50 flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-2 text-sm text-amber-900">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-medium">{t('latenessHeader') || 'Classement des retards'}</span>
              <span className="text-xs text-amber-700">
                {t('latenessRule') || 'Calcul minute-précis · jours fériés et repos exclus'}
              </span>
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
              <Loader className="w-5 h-5 animate-spin" /><span className="text-sm">{t('loading')}...</span>
            </div>
          ) : latenessRanking.length === 0 ? (
            <div className="px-4 py-12 text-center text-gray-400 text-sm">
              {t('latenessEmpty') || 'Aucun retard détecté sur la période.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3 w-10">#</th>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">{t('employeeName')}</th>
                    <th className="px-4 py-3">{t('department')}</th>
                    <th className="px-4 py-3 text-center">{t('latenessDaysCol') || 'Jours en retard'}</th>
                    <th className="px-4 py-3 text-right">{t('totalLateCol') || 'Total retard'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {latenessRanking.map((r, i) => (
                    <tr key={r.employee_id || i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-center text-gray-500 font-medium">{i + 1}</td>
                      <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{r.employee_id}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{r.employee_name || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.department || '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        {r.late_days_count > 0
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">{r.late_days_count}</span>
                          : <span className="text-gray-400">0</span>}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${r.total_late_minutes > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                        {fmtLateMin(r.total_late_minutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* No cumulative total row: summing retard across distinct
                    employees is meaningless. Each row already shows that
                    person's own total in the rightmost column. */}
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tabs (Summary/Details) — hidden in lateness_only mode */}
      {hasSearched && reportType !== 'lateness_only' && (
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
                    <th className="px-4 py-3">{t('totalWorked')}</th>
                    <th className="px-4 py-3">{t('overtime')}</th>
                    {showLateCol && <th className="px-4 py-3">{t('lateMinutes')}</th>}
                    {attendanceMode === 'strict' && <th className="px-4 py-3">{t('earlyDeparture')}</th>}
                    <th className="px-4 py-3 text-center">{t('swipes') || 'Swipes'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {groupedSummary ? (
                    groupedSummary.map(([group, items]) => (
                      <React.Fragment key={group}>
                        <tr className="bg-primary-50/60">
                          <td colSpan={colCount} className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-primary-800 text-sm">{groupLabel(effectiveGroupBy, group, items)}</span>
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
                            <td className="px-4 py-2.5 text-gray-700">{fmtMin(r.total_minutes)}</td>
                            <td className="px-4 py-2.5">
                              {r.overtime_minutes > 0 ? (
                                <span className="text-purple-700 font-medium">{fmtMin(r.overtime_minutes)}</span>
                              ) : <span className="text-gray-400">-</span>}
                            </td>
                            {showLateCol && (
                              <td className="px-4 py-2.5">
                                {r.late_minutes > 0 ? (
                                  <span className="text-amber-700 font-medium">{fmtMin(r.late_minutes)}</span>
                                ) : <span className="text-gray-400">-</span>}
                              </td>
                            )}
                            {attendanceMode === 'strict' && (
                              <td className="px-4 py-2.5">
                                {r.early_departure_minutes > 0 ? (
                                  <span className="text-orange-700 font-medium">{fmtMin(r.early_departure_minutes)}</span>
                                ) : <span className="text-gray-400">-</span>}
                              </td>
                            )}
                            <td className="px-4 py-2.5 text-center">
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                                {r.swipes}
                              </span>
                              <SourceBadge sources={r.sources} />
                            </td>
                          </tr>
                        ))}
                        {/* Per-group 'Total retard' footer when 'Avec retards' is active */}
                        {reportType === 'with_lateness' && (() => {
                          const totalLate = items.reduce((s, r) => s + (r.late_minutes || 0), 0);
                          return (
                            <tr className="bg-amber-50/40 border-t">
                              <td className="px-4 py-2 text-xs text-amber-900 font-medium" colSpan={colCount - 1}>
                                {t('totalLateForGroup') || 'Total retard'} — {groupLabel(effectiveGroupBy, group, items)}
                              </td>
                              <td className="px-4 py-2 text-right text-amber-800 font-bold text-sm">{fmtLateMin(totalLate)}</td>
                            </tr>
                          );
                        })()}
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
                        <td className="px-4 py-2.5 text-gray-700">{fmtMin(r.total_minutes)}</td>
                        <td className="px-4 py-2.5">
                          {r.overtime_minutes > 0 ? (
                            <span className="text-purple-700 font-medium">{fmtMin(r.overtime_minutes)}</span>
                          ) : <span className="text-gray-400">-</span>}
                        </td>
                        {showLateCol && (
                          <td className="px-4 py-2.5">
                            {r.late_minutes > 0 ? (
                              <span className="text-amber-700 font-medium">{fmtMin(r.late_minutes)}</span>
                            ) : <span className="text-gray-400">-</span>}
                          </td>
                        )}
                        {attendanceMode === 'strict' && (
                          <td className="px-4 py-2.5">
                            {r.early_departure_minutes > 0 ? (
                              <span className="text-orange-700 font-medium">{fmtMin(r.early_departure_minutes)}</span>
                            ) : <span className="text-gray-400">-</span>}
                          </td>
                        )}
                        <td className="px-4 py-2.5 text-center">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                            {r.swipes}
                          </span>
                          <SourceBadge sources={r.sources} />
                        </td>
                      </tr>
                    ))
                  )}
                  {summary.length === 0 && (
                    <tr>
                      <td className="px-4 py-12 text-center text-gray-400" colSpan={colCount}>
                        {t('noData')}
                      </td>
                    </tr>
                  )}
                </tbody>
                {/* Grand-total Retard row — flat layout only, and only when the
                    report is about ONE employee (sum across many people is
                    a meaningless figure; use 'group by employee' for that). */}
                {(() => {
                  if (reportType !== 'with_lateness' || groupedSummary || summary.length === 0) return null;
                  const distinctEmp = new Set(summary.map(r => r.employee_id));
                  if (distinctEmp.size !== 1) return null;
                  const total = summary.reduce((s, r) => s + (r.late_minutes || 0), 0);
                  const name = summary[0]?.employee_name || '—';
                  return (
                    <tfoot className="bg-amber-50/60 border-t">
                      <tr>
                        <td className="px-4 py-2.5 text-xs text-amber-900 font-medium" colSpan={colCount - 1}>
                          {t('totalLateForPeriod') || 'Total retard sur la période'} — {name}
                        </td>
                        <td className="px-4 py-2.5 text-right text-amber-800 font-bold text-sm">
                          {fmtLateMin(total)}
                        </td>
                      </tr>
                    </tfoot>
                  );
                })()}
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
                    <th className="px-4 py-3">{t('punchCategory') || 'Category'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {groupedRecords ? (
                    groupedRecords.map(([group, items]) => (
                      <React.Fragment key={group}>
                        <tr className="bg-primary-50/60">
                          <td colSpan={7} className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-primary-800 text-sm">{groupLabel(effectiveGroupBy, group, items)}</span>
                              <span className="text-xs text-gray-500">({items.length})</span>
                            </div>
                          </td>
                        </tr>
                        {items.map(r => {
                          const catStyle = PUNCH_CATEGORY_STYLES[r.punch_category] || PUNCH_CATEGORY_STYLES.unknown;
                          return (
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
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${catStyle.bg} ${catStyle.text}`}>
                                {t(catStyle.key)}
                              </span>
                            </td>
                          </tr>
                          );
                        })}
                      </React.Fragment>
                    ))
                  ) : (
                    records.map(r => {
                      const catStyle = PUNCH_CATEGORY_STYLES[r.punch_category] || PUNCH_CATEGORY_STYLES.unknown;
                      return (
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
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${catStyle.bg} ${catStyle.text}`}>
                            {t(catStyle.key)}
                          </span>
                        </td>
                      </tr>
                      );
                    })
                  )}
                  {records.length === 0 && (
                    <tr>
                      <td className="px-4 py-12 text-center text-gray-400" colSpan={7}>
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
