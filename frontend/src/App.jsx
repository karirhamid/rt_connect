import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { LayoutDashboard, Settings, Menu, X, HardDrive, Building2, ChevronDown, Clock, Filter, Users, Globe, Calendar, UserCog, ChevronLeft, ChevronRight, Info, Wrench, BarChart3 } from 'lucide-react';
import { useState, useEffect, useLayoutEffect } from 'react';
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
import UsersManagement from './pages/UsersManagement';
import RolesManagement from './pages/RolesManagement';
import Maintenance from './pages/Maintenance';
import Reports from './pages/Reports';
import Login from './pages/Login';
import api from './services/api';
import ProfileMenu from './components/ProfileMenu';
import Sidebar from './components/Sidebar';

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [sidebarStyle, setSidebarStyle] = useState(() => {
    try {
      return localStorage.getItem('sidebarStyle') || 'classic';
    } catch (e) {
      return 'classic';
    }
  });
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

  // Build a functional sidebar structure: sections group related items.
  let sidebarSections = [
    {
      key: 'main',
      title: t('sidebarMain'),
      icon: LayoutDashboard,
      items: [{ name: t('dashboard'), href: '/', icon: LayoutDashboard }],
    },
    {
      key: 'people',
      title: t('sidebarPeople'),
      icon: Users,
      items: [
        { name: t('employees'), href: '/employees', icon: Users },
        { name: t('users') || 'Users', href: '/settings/users', icon: Users },
        { name: t('roles') || 'Roles', href: '/settings/roles', icon: UserCog },
      ],
    },
    {
      key: 'attendance',
      title: t('sidebarAttendance'),
      icon: Clock,
      items: [
        { name: t('todaysAttendance'), href: '/attendance/today', icon: Clock },
        { name: t('filterAttendance'), href: '/attendance/filter', icon: Filter },
        { name: t('reports') || 'Reports', href: '/reports', icon: BarChart3 },
      ],
    },
    {
      key: 'devices',
      title: t('sidebarDevices'),
      icon: HardDrive,
      items: [
        { name: t('devices'), href: '/settings/devices', icon: HardDrive },
        { name: t('companyConfig'), href: '/settings/company', icon: Building2 },
      ],
    },
    {
      key: 'settings',
      title: t('sidebarSettings'),
      icon: Settings,
      items: [
        { name: t('general'), href: '/settings/general', icon: Globe },
        { name: t('shifts'), href: '/settings/shifts', icon: Clock },
        { name: t('holidays'), href: '/settings/holidays', icon: Calendar },
        { name: t('bulkAssignShifts'), href: '/settings/bulk-assign', icon: UserCog },
        { name: t('maintenance') || 'Maintenance', href: '/settings/maintenance', icon: Wrench },
      ],
    },
  ];

  // Fallback: ensure 'People' section always contains Users and Roles links.
  // This protects against prior menu reorganizations that accidentally removed them.
  const ensurePeopleSection = () => {
    try {
      let people = sidebarSections.find(s => s.key === 'people');
      if (!people) {
        people = { key: 'people', title: t('sidebarPeople'), items: [] };
        // Insert after main section when possible
        sidebarSections.splice(1, 0, people);
      }
      if (!people.items.some(i => i.href === '/settings/users')) {
        people.items.push({ name: t('users') || 'Users', href: '/settings/users', icon: Users });
      }
      if (!people.items.some(i => i.href === '/settings/roles')) {
        people.items.push({ name: t('roles') || 'Roles', href: '/settings/roles', icon: UserCog });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('ensurePeopleSection error', e);
    }
  };
  ensurePeopleSection();

  // Determine which section owns the current route.
  // Use longest-prefix match so '/' doesn't incorrectly win over '/employees'.
  const activeSectionKey = (() => {
    const path = location.pathname || '/';
    let bestMatch = { key: null, length: 0 };
    for (const s of sidebarSections) {
      for (const i of s.items) {
        const href = i.href || '';
        if (!href) continue;
        if (path === href) {
          // exact match — best possible
          return s.key;
        }
        if (path.startsWith(href) && href.length > bestMatch.length) {
          bestMatch = { key: s.key, length: href.length };
        }
      }
    }
    return bestMatch.key;
  })();

  // Accordion: only one section open at a time, initialized from current route
  const [openSectionKey, setOpenSectionKey] = useState(() => activeSectionKey);
  useLayoutEffect(() => {
    setOpenSectionKey(activeSectionKey);
  }, [activeSectionKey]);
  const toggleSection = (key) => {
    setOpenSectionKey(prev => (prev === key ? null : key));
  };

  // No extra route-change effect needed — `openSectionKey` is kept
  // in sync with `activeSectionKey` by useLayoutEffect above.

  const isActive = (path) => location.pathname === path;
  const isRTL = i18n.language === 'ar';



  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || 'system';
    } catch (e) {
      return 'system';
    }
  });

  // Authentication state (simple): track access token presence
  const [token, setToken] = useState(() => api.getAccessToken());
  useEffect(() => {
    const iv = setInterval(() => setToken(api.getAccessToken()), 800);
    return () => clearInterval(iv);
  }, []);

  // Listen for auth change events so we update immediately after login/logout
  useEffect(() => {
    const onAuthChanged = () => setToken(api.getAccessToken());
    window.addEventListener('authChanged', onAuthChanged);
    return () => window.removeEventListener('authChanged', onAuthChanged);
  }, []);




  
  useEffect(() => {
    try {
      localStorage.setItem('sidebarStyle', sidebarStyle);
    } catch (e) {
      // ignore
    }
  }, [sidebarStyle]);

  // Sidebar collapse state: when collapsed show only icons; persist preference
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebarCollapsed') === 'true'; } catch (e) { return false; }
  });
  useEffect(() => { try { localStorage.setItem('sidebarCollapsed', sidebarCollapsed ? 'true' : 'false'); } catch (e) {} }, [sidebarCollapsed]);



  // Apply theme and listen for changes from settings tab
  useEffect(() => {
    const applyTheme = (t) => {
      try {
        localStorage.setItem('theme', t);
      } catch (e) {}
      if (t === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (t === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        // system: remove explicit class
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme(theme);

    const onThemeChange = (e) => applyTheme(e.detail);
    const onSidebarChange = (e) => setSidebarStyle(e.detail);

    window.addEventListener('themeChange', onThemeChange);
    window.addEventListener('sidebarStyleChange', onSidebarChange);

    return () => {
      window.removeEventListener('themeChange', onThemeChange);
      window.removeEventListener('sidebarStyleChange', onSidebarChange);
    };
  }, [theme]);
  // Compute main content margin — only on lg+ (sidebar is off-canvas on mobile)
  const sidebarWidthClass = isRTL
    ? (sidebarCollapsed ? 'lg:mr-16' : 'lg:mr-64')
    : (sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64');

  // If user is not authenticated, render only the login route and hide the app UI.
  // Placed after all hooks to preserve hook call order across renders.
  if (!token) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Login />} />
        </Routes>
      </div>
    );
  }

  // Determine active route name for the topbar title
  const activeItemName = (() => {
    for (const s of sidebarSections) {
      for (const it of s.items) {
        if (isActive(it.href)) return it.name;
      }
    }
    return t('dashboard');
  })();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar
        sections={sidebarSections}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        openSections={openSectionKey ? { [openSectionKey]: true } : {}}
        toggleSection={toggleSection}
        isActive={isActive}
        isRTL={isRTL}
      />

      {/* Main content */}
      <div className={sidebarWidthClass}>
        {/* Top bar */}
        <div className="bg-white shadow-sm h-16 flex items-center px-4 sm:px-6 lg:px-8 sticky top-0 z-30 min-w-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className={`lg:hidden text-gray-500 hover:text-gray-700 ${isRTL ? 'ml-2' : 'mr-2'}`}
              aria-label="Open sidebar"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="hidden md:flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-800 truncate max-w-xs">
                {activeItemName}
              </h2>
              <div className="h-6 w-px bg-gray-200" />
              <div className="relative">
                <input aria-label={t('search')} placeholder={t('searchPlaceholder')} className="hidden md:block w-60 pl-3 pr-10 py-1.5 border rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-1 focus:ring-primary-200" />
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden lg:flex items-center">
              <button
                onClick={() => setSidebarCollapsed(s => !s)}
                title={sidebarCollapsed ? t('expandSidebar') : t('collapseSidebar')}
                className="inline-flex items-center justify-center w-9 h-9 rounded-md text-gray-600 hover:bg-gray-100 border"
                aria-pressed={sidebarCollapsed}
              >
                {sidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
              </button>
            </div>
            <ProfileMenu />
          </div>
        </div>

        {/* Page content */}
        <main className="p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/employees" element={<EmployeeManagement />} />
            <Route path="/attendance/today" element={<AttendanceToday />} />
            <Route path="/attendance/filter" element={<AttendanceFilter />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings/general" element={<GeneralSettings />} />
            <Route path="/settings/devices" element={<DeviceSettings />} />
            <Route path="/settings/company" element={<CompanyConfig />} />
            <Route path="/settings/users" element={<UsersManagement />} />
            <Route path="/settings/roles" element={<RolesManagement />} />
            <Route path="/login" element={<Login />} />
            <Route path="/settings/shifts" element={<ShiftManagement />} />
            <Route path="/settings/holidays" element={<HolidayCalendar />} />
            <Route path="/settings/bulk-assign" element={<BulkShiftAssignment />} />
            <Route path="/settings/maintenance" element={<Maintenance />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
