import { useState, useEffect } from 'react';
import { Calendar, Clock, Users, TrendingUp, AlertCircle, CheckCircle, Loader2, RefreshCw, ToggleLeft, ToggleRight, Edit2, Trash2, Plus, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import SyncOverlay from '../components/SyncOverlay';
import CorrectionModal from '../components/CorrectionModal';

const PUNCH_CATEGORY_STYLES = {
  entry:         { bg: 'bg-green-100', text: 'text-green-800', key: 'punchEntry' },
  break_out:     { bg: 'bg-amber-100', text: 'text-amber-800', key: 'punchBreakOut' },
  break_in:      { bg: 'bg-cyan-100',  text: 'text-cyan-800',  key: 'punchBreakIn' },
  exit:          { bg: 'bg-blue-100',  text: 'text-blue-800',  key: 'punchExit' },
  overtime_exit: { bg: 'bg-purple-100',text: 'text-purple-800',key: 'punchOvertimeExit' },
  unknown:       { bg: 'bg-gray-100',  text: 'text-gray-600',  key: 'punchUnknown' },
};

function AttendanceToday() {
  const { t } = useTranslation();
  // Computed-hours columns (Total worked / Overtime / Late / Early) are hidden
  // for a plain Reporting User. They show for managers and for the dedicated
  // "RH Reporting logs" role (which holds the reports.hours permission).
  const userPerms = (() => {
    try { return new Set(JSON.parse(localStorage.getItem('_userPerms') || '[]')); } catch { return new Set(); }
  })();
  const canSeeHours =
    userPerms.has('reports.hours') ||
    userPerms.has('roles.manage') || userPerms.has('users.read') ||
    userPerms.has('settings.manage') || userPerms.has('devices.manage');
  const [attendanceData, setAttendanceData] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [stats, setStats] = useState({
    present: 0,
    late: 0,
    absent: 0,
    totalEmployees: 0
  });
  const [devices, setDevices] = useState([]);
  const [deviceData, setDeviceData] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncOverlay, setSyncOverlay] = useState({ visible: false, phase: 'syncing', deviceName: '', direction: 'fromDevice' });
  const [classifiedView, setClassifiedView] = useState(false);
  const [classifiedRecords, setClassifiedRecords] = useState([]);
  const [attendanceMode, setAttendanceMode] = useState('simple');
  const [employeeMode, setEmployeeMode] = useState('shared');
  const [correction, setCorrection] = useState(null);  // { mode, employee, originalAttendanceId, defaultTimestamp, defaultPunchType }
  const [daySummaries, setDaySummaries] = useState({});
  // Reports-style per-employee summary for the selected day (only employees who punched)
  const [summaryRows, setSummaryRows] = useState([]);
  // "Sync since last logs" — fills the gap from the last stored punch up to now
  const [smartSync, setSmartSync] = useState(null); // { startDate, endDate, newCount, dupCount, busy }

  const fmtMin = (m) => {
    if (m == null) return '-';
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h > 0 ? `${h}h${r > 0 ? String(r).padStart(2, '0') + 'm' : ''}` : `${r}m`;
  };

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(() => {
    if (devices.length > 0) {
      fetchTodayAttendance();
      // Auto-refresh every 2 minutes only if viewing today
      const isToday = selectedDate === new Date().toISOString().split('T')[0];
      if (isToday) {
        const interval = setInterval(fetchTodayAttendance, 120000);
        return () => clearInterval(interval);
      }
    }
  }, [selectedDate, devices]);

  const loadDevices = async () => {
    try {
      const devicesRes = await api.getDevices();
      setDevices(devicesRes.devices || []);
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  };

  const fetchTodayAttendance = async () => {
    setLoading(true);
    try {
      const [attendanceRes, statsRes] = await Promise.all([
        api.getTodayAttendance(selectedDate),
        api.getStatistics()
      ]);
      
      // Set attendance data (now returns individual records)
      const records = attendanceRes.attendance || [];
      setAttendanceData(records);
      
      // Pick up employee_mode from either response
      const empMode = statsRes.employee_mode || attendanceRes.employee_mode || 'shared';
      setEmployeeMode(empMode);
      
      // Group records by device
      const deviceGroups = {};
      devices.forEach(device => {
        deviceGroups[device.id] = {
          device: device,
          records: [],
          employeeRecords: {},
          stats: { present: 0, late: 0, absent: 0, total: 0 }
        };
      });
      
      // Distribute records to their respective devices
      records.forEach(record => {
        const deviceId = record.device_id;
        if (deviceGroups[deviceId]) {
          deviceGroups[deviceId].records.push(record);
          
          if (!deviceGroups[deviceId].employeeRecords[record.employee_id]) {
            deviceGroups[deviceId].employeeRecords[record.employee_id] = {
              checkIns: [],
              checkOuts: [],
              name: record.employee_name
            };
          }
          
          if (record.punch === 0 || record.type === 'check_in') {
            deviceGroups[deviceId].employeeRecords[record.employee_id].checkIns.push(record);
          } else {
            deviceGroups[deviceId].employeeRecords[record.employee_id].checkOuts.push(record);
          }
        }
      });
      
      // Calculate stats for each device
      Object.values(deviceGroups).forEach(deviceGroup => {
        let present = 0;
        let late = 0;
        Object.values(deviceGroup.employeeRecords).forEach(empRec => {
          if (empRec.checkIns.length > 0) {
            const firstCheckIn = empRec.checkIns[0];
            const checkInTime = new Date(firstCheckIn.timestamp);
            if (checkInTime.getHours() >= 9 && checkInTime.getMinutes() > 0) {
              late++;
            } else {
              present++;
            }
          }
        });
        deviceGroup.stats.present = present;
        deviceGroup.stats.late = late;
        deviceGroup.stats.total = Object.keys(deviceGroup.employeeRecords).length;
      });
      
      setDeviceData(deviceGroups);
      
      // Calculate overall stats
      // In 'shared' mode: deduplicate by employee_id across devices
      // In 'separate' mode: sum per-device stats (no dedup)
      let totalPresent = 0;
      let totalLate = 0;
      let totalUnique = 0;

      if (empMode === 'shared') {
        const globalEmployees = {};
        records.forEach(record => {
          const eid = record.employee_id;
          if (!globalEmployees[eid]) {
            globalEmployees[eid] = { checkIns: [], name: record.employee_name };
          }
          if (record.punch === 0 || record.type === 'check_in') {
            globalEmployees[eid].checkIns.push(record);
          }
        });
        Object.values(globalEmployees).forEach(emp => {
          if (emp.checkIns.length > 0) {
            const firstCheckIn = emp.checkIns.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0];
            const checkInTime = new Date(firstCheckIn.timestamp);
            if (checkInTime.getHours() >= 9 && checkInTime.getMinutes() > 0) {
              totalLate++;
            } else {
              totalPresent++;
            }
          }
        });
        totalUnique = Object.keys(globalEmployees).length;
      } else {
        // Separate mode: each device's employees are unique, just sum
        Object.values(deviceGroups).forEach(deviceGroup => {
          totalPresent += deviceGroup.stats.present;
          totalLate += deviceGroup.stats.late;
          totalUnique += deviceGroup.stats.total;
        });
      }
      const totalEmployees = statsRes.total_users || 0;
      
      setStats({
        present: totalPresent,
        late: totalLate,
        absent: totalEmployees - totalUnique,
        totalEmployees: totalEmployees
      });
      
      setLastSync(new Date());

      // Reports-style per-employee daily summary (only employees who punched)
      try {
        const sumResp = await api.authFetch(`/api/reports/attendance/summary?date=${selectedDate}`, { method: 'GET' });
        if (sumResp.ok) {
          const sumData = await sumResp.json();
          setSummaryRows(sumData.summary || []);
          setAttendanceMode(sumData.attendance_mode || 'simple');
        } else {
          setSummaryRows([]);
        }
      } catch {
        setSummaryRows([]);
      }
    } catch (error) {
      console.error('Failed to fetch attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setSyncOverlay({ visible: true, phase: 'syncing', deviceName: '', direction: 'fromDevice' });
    try {
      await api.triggerSync();
      setSyncOverlay({ visible: true, phase: 'done', deviceName: '', direction: 'fromDevice' });
      await new Promise(r => setTimeout(r, 800));
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'fromDevice' });
      await fetchTodayAttendance();
      if (classifiedView) await fetchClassified();
    } catch (error) {
      setSyncOverlay({ visible: true, phase: 'error', deviceName: '', direction: 'fromDevice' });
      await new Promise(r => setTimeout(r, 1200));
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'fromDevice' });
      console.error('Sync failed:', error);
    } finally {
      setSyncing(false);
    }
  };

  // ── "Sync since last logs" — preview the gap from the last stored punch → now ──
  const startSmartSync = async () => {
    if (!devices.length) return;
    setSyncing(true);
    setSyncOverlay({ visible: true, phase: 'syncing', deviceName: '', direction: 'fromDevice' });
    try {
      // 1) Find the last stored punch date
      const resp = await api.authFetch('/api/attendance/latest-log-date', { method: 'GET' });
      const data = await resp.json().catch(() => ({}));
      const todayISO = new Date().toISOString().split('T')[0];
      const startDate = data.latest_date || todayISO;  // from 01h of that day
      const endDate = todayISO;

      // 2) Preview across all devices, aggregate counts (show progress per device)
      let newCount = 0, dupCount = 0;
      for (const device of devices) {
        setSyncOverlay({ visible: true, phase: 'syncing', deviceName: device.name, direction: 'fromDevice' });
        try {
          const r = await api.syncAttendanceFromDevice(device.id, 0, true, { startDate, endDate });
          newCount += r.new_count || 0;
          dupCount += r.duplicate_count || 0;
        } catch (e) {
          console.error(`Preview failed for ${device.name}:`, e);
        }
      }

      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'fromDevice' });
      setSmartSync({ startDate, endDate, newCount, dupCount, busy: false });
    } catch (error) {
      setSyncOverlay({ visible: true, phase: 'error', deviceName: '', direction: 'fromDevice' });
      await new Promise(r => setTimeout(r, 1200));
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'fromDevice' });
      console.error('Smart sync preview failed:', error);
    } finally {
      setSyncing(false);
    }
  };

  // Confirm → actually import, WITHOUT showing a result summary
  const confirmSmartSync = async () => {
    if (!smartSync) return;
    const { startDate, endDate } = smartSync;
    setSmartSync(s => ({ ...s, busy: true }));
    setSyncOverlay({ visible: true, phase: 'syncing', deviceName: '', direction: 'fromDevice' });
    try {
      for (const device of devices) {
        setSyncOverlay({ visible: true, phase: 'syncing', deviceName: device.name, direction: 'fromDevice' });
        try {
          await api.syncAttendanceFromDevice(device.id, 0, false, { startDate, endDate });
        } catch (e) {
          console.error(`Sync failed for ${device.name}:`, e);
        }
      }
      setSyncOverlay({ visible: true, phase: 'done', deviceName: '', direction: 'fromDevice' });
      await new Promise(r => setTimeout(r, 800));
    } finally {
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'fromDevice' });
      setSmartSync(null);
      await fetchTodayAttendance();
      if (classifiedView) await fetchClassified();
    }
  };

  const fetchClassified = async () => {
    try {
      const res = await api.getClassifiedAttendance(selectedDate);
      setClassifiedRecords(res.records || []);
      setAttendanceMode(res.attendance_mode || 'simple');
      if (res.employee_mode) setEmployeeMode(res.employee_mode);
      setDaySummaries(res.day_summaries || {});
    } catch (e) {
      console.error('Failed to load classified attendance:', e);
      setClassifiedRecords([]);
    }
  };

  useEffect(() => {
    if (classifiedView && !loading) {
      fetchClassified();
    }
  }, [classifiedView, selectedDate, attendanceData]);

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="space-y-6">
      <SyncOverlay visible={syncOverlay.visible} phase={syncOverlay.phase} deviceName={syncOverlay.deviceName} direction={syncOverlay.direction} />
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{t('todaysAttendance')}</h1>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              employeeMode === 'shared'
                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
            }`}>
              <Users className="w-3 h-3" />
              {employeeMode === 'shared' ? (t('employeeModeShared') || 'Shared') : (t('employeeModeSeparate') || 'Separate')}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-500">
              {new Date(selectedDate).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Classified / Raw view toggle */}
          <button
            onClick={() => setClassifiedView(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              classifiedView ? 'bg-primary-100 text-primary-700 border border-primary-300' : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
            }`}
            title={classifiedView ? t('rawView') : t('classifiedView')}
          >
            {classifiedView ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {classifiedView ? (t('classifiedView') || 'Classified') : (t('rawView') || 'Raw')}
          </button>
          {lastSync && (
            <span className="text-sm text-gray-500">
              {t('lastUpdated')}: {formatTime(lastSync)}
            </span>
          )}
          <button
            onClick={startSmartSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            title={t('syncSinceLastDesc') || 'Synchroniser depuis le dernier pointage enregistré jusqu\'à maintenant'}
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {syncing ? t('syncing') : (t('syncSinceLast') || 'Synchroniser')}
          </button>
          <button
            onClick={() => setCorrection({ mode: 'add', employee: null, originalAttendanceId: null, defaultTimestamp: new Date().toISOString(), defaultPunchType: 0 })}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            title={t('addManualPunch') || 'Pointage manuel'}
          >
            <Plus className="w-4 h-4" />
            {t('addManualPunch') || 'Manuel'}
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t('totalEmployees')}</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalEmployees}</p>
            </div>
            <Users className="w-12 h-12 text-blue-500 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t('presentToday')}</p>
              <p className="text-3xl font-bold text-green-600 mt-2">{stats.present}</p>
              <p className="text-xs text-gray-500 mt-1">
                {stats.totalEmployees > 0 ? ((stats.present / stats.totalEmployees) * 100).toFixed(1) : 0}% {t('attendanceRate')}
              </p>
            </div>
            <CheckCircle className="w-12 h-12 text-green-500 opacity-20" />
          </div>
        </div>

        {attendanceMode === 'strict' ? (
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-amber-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('lateArrivals')}</p>
                <p className="text-3xl font-bold text-amber-600 mt-2">{stats.late}</p>
                <p className="text-xs text-gray-500 mt-1">{t('afterTime')}</p>
              </div>
              <Clock className="w-12 h-12 text-amber-500 opacity-20" />
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('overtime')}</p>
                <p className="text-3xl font-bold text-purple-600 mt-2">
                  {(() => {
                    const totalOT = Object.values(daySummaries).reduce((s, d) => s + (d.overtime_minutes || 0), 0);
                    const h = Math.floor(totalOT / 60);
                    const m = totalOT % 60;
                    return h > 0 ? `${h}h${m > 0 ? m + 'm' : ''}` : `${m}m`;
                  })()}
                </p>
                <p className="text-xs text-gray-500 mt-1">{t('totalOvertime')}</p>
              </div>
              <TrendingUp className="w-12 h-12 text-purple-500 opacity-20" />
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t('absent')}</p>
              <p className="text-3xl font-bold text-red-600 mt-2">{stats.absent}</p>
              <p className="text-xs text-gray-500 mt-1">{t('noCheckInYet')}</p>
            </div>
            <AlertCircle className="w-12 h-12 text-red-500 opacity-20" />
          </div>
        </div>
      </div>

      {/* Attendance by Device */}
      {loading ? (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="h-12 w-12 bg-gray-200 rounded-full animate-pulse"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2"></div>
                </div>
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>
      ) : attendanceData.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Calendar className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg">{t('noAttendanceRecords')}</p>
          <p className="text-gray-400 text-sm mt-2">{t('checkInsAppear')}</p>
        </div>
      ) : summaryRows.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Calendar className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg">{t('noAttendanceRecords')}</p>
          <p className="text-gray-400 text-sm mt-2">{t('checkInsAppear')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              {t('employeesPresent') || 'Employés ayant pointé'}
            </h2>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {summaryRows.length} {summaryRows.length === 1 ? (t('employee') || 'employé') : (t('employees') || 'employés')}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">{t('employee')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">{t('department')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">{t('checkIn') || 'Entrée'}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">{t('checkOut') || 'Sortie'}</th>
                  {canSeeHours && (
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">{t('totalWorked') || 'Total'}</th>
                  )}
                  {canSeeHours && (
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">{t('overtime') || 'Sup.'}</th>
                  )}
                  {canSeeHours && attendanceMode === 'strict' && (
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">{t('lateMin') || 'Retard'}</th>
                  )}
                  {canSeeHours && attendanceMode === 'strict' && (
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">{t('earlyMin') || 'Dép. ant.'}</th>
                  )}
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">{t('punches') || 'Passages'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {summaryRows.map((r, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{r.employee_name}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.department || '-'}</td>
                    <td className="px-4 py-2.5">
                      {r.first_check_in ? (
                        <span className="inline-flex items-center gap-1 text-green-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          {new Date(r.first_check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.last_check_out ? (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          {new Date(r.last_check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    {canSeeHours && (
                      <td className="px-4 py-2.5 text-gray-700">{fmtMin(r.total_minutes)}</td>
                    )}
                    {canSeeHours && (
                      <td className="px-4 py-2.5">
                        {r.overtime_minutes > 0 ? (
                          <span className="text-purple-700 font-medium">{fmtMin(r.overtime_minutes)}</span>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                    )}
                    {canSeeHours && attendanceMode === 'strict' && (
                      <td className="px-4 py-2.5">
                        {r.late_minutes > 0 ? <span className="text-amber-700 font-medium">{fmtMin(r.late_minutes)}</span> : <span className="text-gray-400">-</span>}
                      </td>
                    )}
                    {canSeeHours && attendanceMode === 'strict' && (
                      <td className="px-4 py-2.5">
                        {r.early_departure_minutes > 0 ? <span className="text-orange-700 font-medium">{fmtMin(r.early_departure_minutes)}</span> : <span className="text-gray-400">-</span>}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                        {r.swipes}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {correction && (
        <CorrectionModal
          mode={correction.mode}
          employee={correction.employee}
          originalAttendanceId={correction.originalAttendanceId}
          defaultTimestamp={correction.defaultTimestamp}
          defaultPunchType={correction.defaultPunchType}
          onClose={() => setCorrection(null)}
          onSaved={() => { setCorrection(null); fetchTodayAttendance(); }}
        />
      )}

      {/* Smart-sync confirmation (gap fill) — same look as the device sync modal */}
      {smartSync && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/60 max-w-md w-full overflow-hidden animate-[popIn_0.18s_ease-out]">
            <div className="flex items-center gap-3 px-6 pt-5 pb-3">
              <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center">
                <History className="w-[18px] h-[18px] text-primary-600" />
              </div>
              <h2 className="text-[15px] font-semibold text-slate-900">
                {t('syncSinceLast') || 'Combler les pointages manquants'}
              </h2>
            </div>
            <div className="px-6 pb-2">
              <p className="text-sm text-slate-600">
                {(t('syncSinceLastRange') || 'Période à synchroniser')} :{' '}
                <span className="font-mono text-slate-900">{smartSync.startDate} → {smartSync.endDate}</span>
              </p>
              <div className="mt-3 flex items-center gap-6 text-sm">
                <span className="text-emerald-700">
                  {t('newRecords') || 'Nouveaux'} : <strong>{smartSync.newCount}</strong>
                </span>
                <span className="text-slate-500">
                  {t('existingRecords') || 'Déjà enregistrés'} : <strong>{smartSync.dupCount}</strong>
                </span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4">
              <button
                onClick={() => setSmartSync(null)}
                disabled={smartSync.busy}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                {t('cancel') || 'Annuler'}
              </button>
              <button
                onClick={confirmSmartSync}
                disabled={smartSync.busy || smartSync.newCount === 0}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                {smartSync.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {t('confirm') || 'Confirmer'}
              </button>
            </div>
          </div>
          <style>{`
            @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
            @keyframes popIn { 0% { opacity: 0; transform: scale(0.96) } 70% { transform: scale(1.01) } 100% { opacity: 1; transform: scale(1) } }
          `}</style>
        </div>
      )}
    </div>
  );
}

export default AttendanceToday;
