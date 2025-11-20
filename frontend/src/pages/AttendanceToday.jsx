import { useState, useEffect } from 'react';
import { Calendar, Clock, Users, TrendingUp, AlertCircle, CheckCircle, Loader2, RefreshCw } from 'lucide-react';
import api from '../services/api';

function AttendanceToday() {
  const [attendanceData, setAttendanceData] = useState([]);
  const [stats, setStats] = useState({
    present: 0,
    late: 0,
    absent: 0,
    totalEmployees: 0
  });
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchTodayAttendance();
    // Auto-refresh every 2 minutes
    const interval = setInterval(fetchTodayAttendance, 120000);
    return () => clearInterval(interval);
  }, []);

  const fetchTodayAttendance = async () => {
    setLoading(true);
    try {
      const [attendanceRes, statsRes] = await Promise.all([
        api.getTodayAttendance(),
        api.getStatistics()
      ]);
      
      // Set attendance data
      setAttendanceData(attendanceRes.attendance || []);
      
      // Calculate stats
      const attendanceList = attendanceRes.attendance || [];
      const present = attendanceList.filter(a => a.status === 'present').length;
      const late = attendanceList.filter(a => a.status === 'late').length;
      const totalEmployees = statsRes.total_users || 0;
      
      setStats({
        present: present,
        late: late,
        absent: totalEmployees - attendanceList.length,
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
    try {
      await api.triggerSync();
      await fetchTodayAttendance();
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setSyncing(false);
    }
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Today's Attendance</h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {lastSync && (
            <span className="text-sm text-gray-500">
              Last updated: {formatTime(lastSync)}
            </span>
          )}
          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Employees</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalEmployees}</p>
            </div>
            <Users className="w-12 h-12 text-blue-500 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Present Today</p>
              <p className="text-3xl font-bold text-green-600 mt-2">{stats.present}</p>
              <p className="text-xs text-gray-500 mt-1">
                {stats.totalEmployees > 0 ? ((stats.present / stats.totalEmployees) * 100).toFixed(1) : 0}% attendance
              </p>
            </div>
            <CheckCircle className="w-12 h-12 text-green-500 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-amber-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Late Arrivals</p>
              <p className="text-3xl font-bold text-amber-600 mt-2">{stats.late}</p>
              <p className="text-xs text-gray-500 mt-1">After 9:00 AM</p>
            </div>
            <Clock className="w-12 h-12 text-amber-500 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Absent</p>
              <p className="text-3xl font-bold text-red-600 mt-2">{stats.absent}</p>
              <p className="text-xs text-gray-500 mt-1">No check-in yet</p>
            </div>
            <AlertCircle className="w-12 h-12 text-red-500 opacity-20" />
          </div>
        </div>
      </div>

      {/* Attendance List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Check-ins</h2>
        </div>
        
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" />
            <p className="text-gray-500 mt-4">Loading attendance data...</p>
          </div>
        ) : attendanceData.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">No attendance records yet today</p>
            <p className="text-gray-400 text-sm mt-2">Check-ins will appear here in real-time</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check In</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check Out</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {attendanceData.map((record, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{record.employee_name}</div>
                      <div className="text-xs text-gray-500">{record.employee_id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {record.department}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.check_in ? formatTime(record.check_in) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.check_out ? formatTime(record.check_out) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        record.status === 'present' ? 'bg-green-100 text-green-800' :
                        record.status === 'late' ? 'bg-amber-100 text-amber-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {record.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {record.device_name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AttendanceToday;
