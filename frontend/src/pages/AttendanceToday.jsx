import { useState, useEffect } from 'react';
import { Calendar, Clock, Users, TrendingUp, AlertCircle, CheckCircle, Loader2, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import SyncOverlay from '../components/SyncOverlay';

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
  const [daySummaries, setDaySummaries] = useState({});

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
            onClick={handleManualSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? t('syncing') : t('syncNow')}
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
      ) : (
        <div className="space-y-6">
          {devices.map(device => {
            const deviceInfo = deviceData[device.id];
            if (!deviceInfo || deviceInfo.records.length === 0) return null;
            
            return (
              <div key={device.id} className="bg-white rounded-lg shadow">
                {/* Device Header */}
                <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-green-500"></span>
                        {device.name}
                      </h2>
                      <p className="text-sm text-gray-600 mt-1">
                        {device.ip}:{device.port} • {deviceInfo.stats.total} {t('employees')} • {deviceInfo.records.length} {t('records')}
                      </p>
                    </div>
                    <div className="flex gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">{deviceInfo.stats.present}</p>
                        <p className="text-xs text-gray-500">{t('present')}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-amber-600">{deviceInfo.stats.late}</p>
                        <p className="text-xs text-gray-500">{t('late')}</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Device Records Table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('time')}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('employee')}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('department')}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{classifiedView ? (t('punchCategory') || 'Category') : t('type')}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('status')}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {deviceInfo.records
                        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                        .map((record, idx) => {
                        // Find classified info for this record
                        const classifiedInfo = classifiedView
                          ? classifiedRecords.find(c => c.id === record.id)
                          : null;
                        const category = classifiedInfo?.punch_category || 'unknown';
                        const catStyle = PUNCH_CATEGORY_STYLES[category] || PUNCH_CATEGORY_STYLES.unknown;

                        return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {record.time || formatTime(record.timestamp)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{record.employee_name}</div>
                            <div className="text-xs text-gray-500">ID: {record.user_id_str || record.employee_id}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {record.department || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {classifiedView ? (
                              <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${catStyle.bg} ${catStyle.text}`}>
                                {t(catStyle.key) || category}
                              </span>
                            ) : (
                              <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                record.punch === 0 || record.type === 'check_in' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {record.punch === 0 || record.type === 'check_in' ? t('checkIn') : t('checkOut')}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {classifiedView ? (
                              category === 'entry' ? <CheckCircle className="w-5 h-5 text-green-500" /> :
                              category === 'break_out' ? <Clock className="w-5 h-5 text-amber-500" /> :
                              category === 'break_in' ? <RefreshCw className="w-5 h-5 text-cyan-500" /> :
                              category === 'exit' ? <Clock className="w-5 h-5 text-blue-500" /> :
                              category === 'overtime_exit' ? <AlertCircle className="w-5 h-5 text-purple-500" /> :
                              <Clock className="w-5 h-5 text-gray-400" />
                            ) : (
                              record.punch === 0 || record.type === 'check_in' ? (
                                <CheckCircle className="w-5 h-5 text-green-500" />
                              ) : (
                                <Clock className="w-5 h-5 text-blue-500" />
                              )
                            )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AttendanceToday;
