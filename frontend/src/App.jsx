import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Settings, Menu, X, HardDrive, Building2, ChevronDown, Clock, Filter, Users, Globe, Calendar, UserCog } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Dashboard from './pages/Dashboard';
import DeviceSettings from './pages/DeviceSettings';
import CompanyConfig from './pages/CompanyConfig';
import AttendanceToday from './pages/AttendanceToday';
import AttendanceFilter from './pages/AttendanceFilter';
import EmployeeManagement from './pages/EmployeeManagement';
import GeneralSettings from './pages/GeneralSettings';
import ShiftManagement from './pages/ShiftManagement';
import HolidayCalendar from './pages/HolidayCalendar';
import BulkShiftAssignment from './pages/BulkShiftAssignment';

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

function AppContent() {
  const { t, i18n } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [attendanceOpen, setAttendanceOpen] = useState(true);
  const location = useLocation();

  useEffect(() => {
    // Apply RTL for Arabic
    if (i18n.language === 'ar') {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
      document.documentElement.classList.add('font-arabic');
    } else {
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = i18n.language;
      document.documentElement.classList.remove('font-arabic');
    }
  }, [i18n.language]);

  const navigation = [
    { name: t('dashboard'), href: '/', icon: LayoutDashboard },
    { name: t('employees'), href: '/employees', icon: Users },
  ];

  const attendanceMenu = [
    { name: t('pointageToday'), href: '/attendance/today', icon: Clock },
    { name: t('filterPointage'), href: '/attendance/filter', icon: Filter },
  ];

  const settingsMenu = [
    { name: t('general'), href: '/settings/general', icon: Globe },
    { name: t('devices'), href: '/settings/devices', icon: HardDrive },
    { name: t('companyConfig'), href: '/settings/company', icon: Building2 },
    { name: t('shifts'), href: '/settings/shifts', icon: Clock },
    { name: t('holidays'), href: '/settings/holidays', icon: Calendar },
    { name: t('bulkAssignShifts'), href: '/settings/bulk-assign', icon: UserCog },
  ];

  const isActive = (path) => location.pathname === path;
  const isRTL = i18n.language === 'ar';

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out ${
        isRTL 
          ? `right-0 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}` 
          : `left-0 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
      }`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
                Z
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">ZKTeco Admin</h1>
                <p className="text-xs text-gray-500">RIRAKTECH</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-gray-500 hover:text-gray-700"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    active
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}

            {/* Attendance Menu */}
            <div>
              <button
                onClick={() => setAttendanceOpen(!attendanceOpen)}
                className="flex items-center justify-between w-full px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5" />
                  <span>{t('attendance')}</span>
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${attendanceOpen ? 'transform rotate-180' : ''}`} />
              </button>
              
              {attendanceOpen && (
                <div className={`mt-2 space-y-1 ${isRTL ? 'mr-4' : 'ml-4'}`}>
                  {attendanceMenu.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                          active
                            ? 'bg-primary-50 text-primary-700 font-medium'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Settings Menu */}
            <div>
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="flex items-center justify-between w-full px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Settings className="w-5 h-5" />
                  <span>{t('settings')}</span>
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${settingsOpen ? 'transform rotate-180' : ''}`} />
              </button>
              
              {settingsOpen && (
                <div className={`mt-2 space-y-1 ${isRTL ? 'mr-4' : 'ml-4'}`}>
                  {settingsMenu.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                          active
                            ? 'bg-primary-50 text-primary-700 font-medium'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200">
            <div className="text-xs text-gray-500">
              <p className="font-semibold text-gray-700">RIRAKTECH SARL</p>
              <p>Hamid KARIR</p>
              <p className="mt-1">hamid.karir@riraktech.ma</p>
              <p>+212 611 644 6889</p>
              <p className="mt-2">© 2025 RIRAKTECH</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className={isRTL ? 'lg:mr-64' : 'lg:ml-64'}>
        {/* Top bar */}
        <div className="bg-white shadow-sm h-16 flex items-center px-6 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className={`lg:hidden text-gray-500 hover:text-gray-700 ${
              isRTL ? 'ml-4' : 'mr-4'
            }`}
          >
            <Menu className="w-6 h-6" />
          </button>
          <h2 className="text-xl font-semibold text-gray-800">
            {navigation.find(item => isActive(item.href))?.name || 
             attendanceMenu.find(item => isActive(item.href))?.name || 
             settingsMenu.find(item => isActive(item.href))?.name || 
             'Dashboard'}
          </h2>
        </div>

        {/* Page content */}
        <main className="p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/employees" element={<EmployeeManagement />} />
            <Route path="/attendance/today" element={<AttendanceToday />} />
            <Route path="/attendance/filter" element={<AttendanceFilter />} />
            <Route path="/settings/general" element={<GeneralSettings />} />
            <Route path="/settings/devices" element={<DeviceSettings />} />
            <Route path="/settings/company" element={<CompanyConfig />} />
            <Route path="/settings/shifts" element={<ShiftManagement />} />
            <Route path="/settings/holidays" element={<HolidayCalendar />} />
            <Route path="/settings/bulk-assign" element={<BulkShiftAssignment />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
