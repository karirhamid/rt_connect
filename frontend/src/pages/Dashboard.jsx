import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Users, Monitor, Clock, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

export default function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

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
    // Auto-refresh only if enabled
    if (autoRefreshEnabled) {
      const interval = setInterval(() => fetchStats(false), 300000); // 5 minutes
      return () => clearInterval(interval);
    }
  }, [autoRefreshEnabled]);

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
