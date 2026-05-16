import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Users, Monitor, Clock, Activity, HardDrive } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

export default function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [deviceStatus, setDeviceStatus] = useState({ devices: [], online_count: 0, total_count: 0, interval_sec: 300 });

  useEffect(() => {
    // Load auto-refresh setting from backend
    const loadSettings = async () => {
      try {
        const settings = await api.getGeneralSettings();
        setAutoRefreshEnabled(!!settings.sync_enabled);
      } catch (err) {
        console.error('Failed to load sync settings:', err);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    fetchStats();
    fetchDeviceStatus();
    // Refresh device heartbeats every 30 s — much shorter than the
    // 5-min stats refresh because heartbeats are what people watch.
    const heartbeatTimer = setInterval(fetchDeviceStatus, 30 * 1000);
    if (autoRefreshEnabled) {
      const interval = setInterval(() => fetchStats(false), 300000); // 5 minutes
      return () => { clearInterval(interval); clearInterval(heartbeatTimer); };
    }
    return () => clearInterval(heartbeatTimer);
  }, [autoRefreshEnabled]);

  const fetchDeviceStatus = async () => {
    try {
      const data = await api.getDevicesStatus();
      setDeviceStatus(data);
    } catch (e) { /* silent — card just keeps old values */ }
  };

  const _fmtRelative = (iso) => {
    if (!iso) return t('never') || 'jamais';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60)    return `il y a ${Math.round(diff)} s`;
    if (diff < 3600)  return `il y a ${Math.round(diff / 60)} min`;
    if (diff < 86400) return `il y a ${Math.round(diff / 3600)} h`;
    return new Date(iso).toLocaleDateString();
  };

  const fetchStats = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await api.getStatistics();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch statistics:', error);
      setError(t('failedToLoad'));
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-9 w-48 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-10 w-24 bg-gray-200 rounded animate-pulse"></div>
        </div>

        {/* Stats Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-3 flex-1">
                  <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-8 w-16 bg-gray-200 rounded animate-pulse"></div>
                </div>
                <div className="w-12 h-12 bg-gray-200 rounded-full animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white p-6 rounded-lg shadow-md">
              <div className="h-6 w-40 bg-gray-200 rounded animate-pulse mb-4"></div>
              <div className="h-[300px] bg-gray-100 rounded animate-pulse"></div>
            </div>
          ))}
        </div>

        {/* Table Skeleton */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="h-12 flex-1 bg-gray-200 rounded animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="text-red-500 text-lg font-semibold">{error}</div>
        <button
          onClick={fetchStats}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">{t('dashboard')}</h1>
        <button
          onClick={fetchStats}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          {t('refresh')}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={<Monitor className="w-8 h-8" />}
          title={t('totalDevices')}
          value={stats?.total_devices || 0}
          color="bg-blue-500"
        />
        <StatCard
          icon={<Users className="w-8 h-8" />}
          title={t('totalUsers')}
          value={stats?.total_users || 0}
          color="bg-green-500"
        />
        <StatCard
          icon={<Clock className="w-8 h-8" />}
          title={t('todayAttendance')}
          value={stats?.today_attendance || 0}
          color="bg-yellow-500"
        />
        <StatCard
          icon={<Activity className="w-8 h-8" />}
          title={t('activeDevices')}
          value={stats?.active_devices || 0}
          color="bg-red-500"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance Chart */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">{t('weeklyAttendance')}</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats?.weekly_attendance || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Device Status */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">{t('deviceStatus')}</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={stats?.device_status || []}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {(stats?.device_status || []).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Live device status (heartbeat) ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 overflow-hidden">
        <div className="p-5 border-b border-slate-200/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">{t('devicesStatusTitle') || 'État des appareils'}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t('heartbeatEvery') || 'Vérification toutes les'} {Math.round((deviceStatus.interval_sec || 300) / 60)} min
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-slate-900">{deviceStatus.online_count}</span>
            <span className="text-sm text-slate-400">/ {deviceStatus.total_count}</span>
            <span className="text-sm text-slate-500 ml-1">{t('online') || 'en ligne'}</span>
          </div>
        </div>

        {deviceStatus.devices.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            {t('noDevicesRegistered') || 'Aucun appareil enregistré'}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {deviceStatus.devices.map((d) => (
              <li key={d.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50/60">
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${
                    d.is_online
                      ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]'
                      : 'bg-gray-300'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{d.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{d.ip}:{d.port}</div>
                </div>
                <div className="text-right text-xs">
                  <div className={d.is_online ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                    {d.is_online ? (t('online') || 'En ligne') : (t('offline') || 'Hors ligne')}
                  </div>
                  <div className="text-slate-400 mt-0.5">
                    {(t('lastSeen') || 'Vu')} {_fmtRelative(d.last_seen_at)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  );
}

function StatCard({ icon, title, value, color }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
        </div>
        <div className={`${color} text-white p-3 rounded-full`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
