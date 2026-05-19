import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { LayoutDashboard, Settings, Menu, HardDrive, Building2, Clock, Users, Calendar, UserCog, ChevronLeft, ChevronRight, Wrench, BarChart3, ArrowLeftRight, CalendarDays, ShieldCheck, FileText, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Dashboard from './pages/Dashboard';
import DeviceSettings from './pages/DeviceSettings';
import CompanyConfig from './pages/CompanyConfig';
import AttendanceToday from './pages/AttendanceToday';

import EmployeeManagement from './pages/EmployeeManagement';
import GeneralSettings from './pages/GeneralSettings';
import ShiftManagement from './pages/ShiftManagement';
import HolidayCalendar from './pages/HolidayCalendar';
import BulkShiftAssignment from './pages/BulkShiftAssignment';
import UsersManagement from './pages/UsersManagement';
import RolesManagement from './pages/RolesManagement';
import Maintenance from './pages/Maintenance';
import AuditLog from './pages/AuditLog';
import AnomalyInbox from './pages/AnomalyInbox';
import Reports from './pages/Reports';
import Login from './pages/Login';
import DeviceSync from './pages/DeviceSync';
import api from './services/api';
import ProfileMenu from './components/ProfileMenu';
import Sidebar from './components/Sidebar';

// Redirects to '/' if the user doesn't have the required permission
function ProtectedRoute({ perm, children }) {
  const perms = (() => {
    try { return new Set(JSON.parse(localStorage.getItem('_userPerms') || '[]')); } catch { return new Set(); }
  })();
  if (!perms.has(perm)) return <Navigate to="/" replace />;
  return children;
}

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
  const [userPerms, setUserPerms] = useState(null); // null = still loading; populated after login
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

  // Build sidebar — 5 sections in professional order
  let sidebarSections = [
    {
      key: 'main',
      title: t('sidebarMain'),
      icon: LayoutDashboard,
      items: [{ name: t('dashboard'), href: '/', icon: LayoutDashboard }],
    },
    {
      key: 'hr',
      title: t('sidebarHR'),
      icon: Users,
      items: [
        { name: t('employees'), href: '/employees', icon: Users },
        { name: t('todaysAttendance'), href: '/attendance/today', icon: Clock },
        { name: t('reports') || 'Reports', href: '/reports', icon: BarChart3 },
        { name: t('anomalyInbox') || 'Anomalies', href: '/anomalies', icon: AlertTriangle, badgeKey: 'anomalies' },
      ],
    },
    {
      key: 'scheduling',
      title: t('sidebarScheduling'),
      icon: CalendarDays,
      items: [
        { name: t('shifts'), href: '/settings/shifts', icon: Clock },
        { name: t('holidays'), href: '/settings/holidays', icon: Calendar },
        { name: t('bulkAssignShifts'), href: '/settings/bulk-assign', icon: UserCog },
      ],
    },
    {
      key: 'devices',
      title: t('sidebarDevices'),
      icon: HardDrive,
      items: [
        { name: t('devices'), href: '/settings/devices', icon: HardDrive },
        { name: t('deviceSync') || 'Device Sync', href: '/employees/device-sync', icon: ArrowLeftRight },
      ],
    },
    {
      key: 'admin',
      title: t('sidebarSettings') || 'Paramètres',
      icon: Settings,
      items: [
        { type: 'divider', label: t('groupSystem') || 'Système' },
        { name: t('general'),       href: '/settings/general',     icon: Settings },
        { name: t('companyConfig'), href: '/settings/company',     icon: Building2 },
        { type: 'divider', label: t('groupAccess') || 'Accès' },
        { name: t('users') || 'Utilisateurs', href: '/settings/users', icon: Users },
        { name: t('roles') || 'Rôles',        href: '/settings/roles', icon: UserCog },
        { type: 'divider', label: t('groupTools') || 'Outils' },
        { name: t('maintenance') || 'Maintenance', href: '/settings/maintenance', icon: Wrench },
        { name: t('auditLog') || "Journal d'audit", href: '/settings/audit-log', icon: FileText },
      ],
    },
  ];

  // Filter sidebar sections based on loaded permissions (null = still loading → show all)
  if (userPerms !== null) {
    const has = (p) => userPerms.has(p);
    sidebarSections = sidebarSections.filter(s => {
      if (s.key === 'main')        return true;
      if (s.key === 'hr')          return has('attendance.read') || has('users.read');
      if (s.key === 'scheduling')  return has('shifts.manage');
      if (s.key === 'devices')     return has('devices.sync') || has('devices.manage');
      if (s.key === 'admin')       return has('users.read') || has('settings.manage');
      return true;
    });
    // Item-level: Super Admin only items
    sidebarSections = sidebarSections.map(s => {
      if (s.key === 'devices' && !has('devices.manage')) {
        return { ...s, items: s.items.filter(i => i.href !== '/employees/device-sync') };
      }
      if (s.key === 'admin' && !has('roles.manage')) {
        return { ...s, items: s.items.filter(i =>
          i.href !== '/settings/roles' &&
          i.href !== '/settings/general' &&
          i.href !== '/settings/maintenance'
        )};
      }
      return s;
    }).map(s => {
      // Strip orphaned dividers (no link items after them before the next divider / end)
      const items = s.items.filter((item, i, arr) => {
        if (item.type !== 'divider') return true;
        for (let j = i + 1; j < arr.length; j++) {
          if (arr[j].type === 'divider') return false;
          return true;
        }
        return false;
      });
      return { ...s, items };
    }).filter(s => s.items.filter(i => i.type !== 'divider').length > 0);
  }

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

  // Load current user permissions when authenticated; store in localStorage for cross-page use
  useEffect(() => {
    if (!token) { setUserPerms(null); localStorage.removeItem('_userPerms'); return; }
    (async () => {
      try {
        const permList = await api.getMyPermissions();
        const perms = new Set(permList);
        setUserPerms(perms);
        localStorage.setItem('_userPerms', JSON.stringify([...perms]));
      } catch (e) {
        setUserPerms(new Set());
      }
    })();
  }, [token]);




  
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
            <div className="hidden md:flex items-center">
              <h2 className="text-lg font-semibold text-gray-800 truncate max-w-md">
                {activeItemName}
              </h2>
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
            <Route path="/employees" element={<ProtectedRoute perm="attendance.read"><EmployeeManagement /></ProtectedRoute>} />
            <Route path="/employees/device-sync" element={<ProtectedRoute perm="devices.manage"><DeviceSync /></ProtectedRoute>} />
            <Route path="/attendance/today" element={<AttendanceToday />} />

            <Route path="/reports" element={<Reports />} />
            <Route path="/settings/general" element={<ProtectedRoute perm="roles.manage"><GeneralSettings /></ProtectedRoute>} />
            <Route path="/settings/devices" element={<ProtectedRoute perm="devices.sync"><DeviceSettings /></ProtectedRoute>} />
            <Route path="/settings/company" element={<ProtectedRoute perm="settings.manage"><CompanyConfig /></ProtectedRoute>} />
            <Route path="/settings/users" element={<ProtectedRoute perm="users.read"><UsersManagement /></ProtectedRoute>} />
            <Route path="/settings/roles" element={<ProtectedRoute perm="roles.manage"><RolesManagement /></ProtectedRoute>} />
            <Route path="/login" element={<Login />} />
            <Route path="/settings/shifts" element={<ProtectedRoute perm="shifts.manage"><ShiftManagement /></ProtectedRoute>} />
            <Route path="/settings/holidays" element={<ProtectedRoute perm="shifts.manage"><HolidayCalendar /></ProtectedRoute>} />
            <Route path="/settings/bulk-assign" element={<ProtectedRoute perm="shifts.manage"><BulkShiftAssignment /></ProtectedRoute>} />
            <Route path="/settings/maintenance" element={<ProtectedRoute perm="roles.manage"><Maintenance /></ProtectedRoute>} />
            <Route path="/settings/audit-log" element={<ProtectedRoute perm="roles.manage"><AuditLog /></ProtectedRoute>} />
            <Route path="/anomalies" element={<ProtectedRoute perm="attendance.read"><AnomalyInbox /></ProtectedRoute>} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
