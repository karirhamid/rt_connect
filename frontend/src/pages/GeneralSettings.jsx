import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Save, Check, AlertCircle, Loader2, RefreshCw, Sun, Timer, Copy, FileText, Mail, Calendar, Play, Trash2, Edit, Plus, Clock, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Eye, Settings } from 'lucide-react';
import api from '../services/api';
import ScheduleModal from '../components/ScheduleModal';

function GeneralSettings() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState('sync');
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language || 'fr');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notification, setNotification] = useState(null);

  // Organized by domain: System & attendance policy first, then reporting,
  // then personal/display preferences last.
  const tabs = [
    { id: 'sync',       name: t('systemTab') || 'Système',                 icon: Settings },
    { id: 'timing',     name: t('timingTab'),                              icon: Timer },
    { id: 'pdf',        name: t('pdfTab'),                                 icon: FileText },
    { id: 'email',      name: t('emailTab') || 'Email SMTP',               icon: Mail },
    { id: 'schedules',  name: t('schedulesTab') || 'Rapports planifiés',   icon: Calendar },
    { id: 'appearance', name: t('appearanceTab'),                          icon: Sun },
    { id: 'language',   name: t('languageTab'),                            icon: Globe },
  ];

  // ── Email (SMTP) state ────────────────────────────────────────────────────
  const [emailCfg, setEmailCfg] = useState({
    is_enabled: false, host: '', port: 587, username: '',
    password: '', use_tls: true, use_ssl: false,
    from_name: '', from_address: '',
    alerts_enabled: false, alerts_recipient_email: '',
  });
  const [emailHasPassword, setEmailHasPassword] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [testEmailAddr, setTestEmailAddr] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);

  // ── Schedules state ───────────────────────────────────────────────────────
  const [schedules, setSchedules] = useState([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(null); // null | 'new' | scheduleObj
  const [expandedLogs, setExpandedLogs] = useState({});
  const [logs, setLogs] = useState({});
  const [runningNow, setRunningNow] = useState({});

  // Appearance / Theme state
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('theme') || 'system'; } catch (e) { return 'system'; }
  });
  const [uiSidebarStyle, setUiSidebarStyle] = useState(() => {
    try { return localStorage.getItem('sidebarStyle') || 'classic'; } catch (e) { return 'classic'; }
  });

  const applyAppearance = (newTheme, newSidebar) => {
    try { if (newTheme) localStorage.setItem('theme', newTheme); } catch (e) {}
    try { if (newSidebar) localStorage.setItem('sidebarStyle', newSidebar); } catch (e) {}

    // Dispatch events so App can react
    if (newTheme) window.dispatchEvent(new CustomEvent('themeChange', { detail: newTheme }));
    if (newSidebar) window.dispatchEvent(new CustomEvent('sidebarStyleChange', { detail: newSidebar }));
  };

  const saveAppearance = () => {
    applyAppearance(theme, uiSidebarStyle);
    showNotification('success', t('appearanceSaved') || 'Appearance saved');
  };

  // Sync settings state
  const [requireSyncConfirmation, setRequireSyncConfirmation] = useState(true);
  const [appName, setAppName] = useState('RTPointage');
  const [clientName, setClientName] = useState('');
  const [heartbeatEnabled, setHeartbeatEnabled] = useState(true);
  const [heartbeatIntervalMin, setHeartbeatIntervalMin] = useState(5);
  const [punchMergeWindowMin, setPunchMergeWindowMin] = useState(5);
  const [validateTimestamps, setValidateTimestamps] = useState(true);
  const [portalEnabled, setPortalEnabled] = useState(false);
  const [loadingSync, setLoadingSync] = useState(false);

  // Timing settings state
  const [timingMode, setTimingMode] = useState('off'); // off | employee | department | both
  const [attendanceMode, setAttendanceMode] = useState('simple'); // simple | strict
  const [employeeMode, setEmployeeMode] = useState('shared'); // shared | separate
  const [departments, setDepartments] = useState([]);
  const [selectedDeptId, setSelectedDeptId] = useState(null);
  const [deptSchedule, setDeptSchedule] = useState(null);
  const [loadingTiming, setLoadingTiming] = useState(false);
  const [savingTiming, setSavingTiming] = useState(false);

  // PDF settings state
  const [pdfStyle, setPdfStyle] = useState('style1');
  const [pdfShowOvertime, setPdfShowOvertime] = useState(true);
  const [pdfShowTotalWorked, setPdfShowTotalWorked] = useState(true);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);

  const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  const emptyWeek = () => DAY_KEYS.map((_, i) => ({
    day_of_week: i, is_day_off: false, work_start: '08:00', work_end: '17:00',
    has_break: false, break_start: '', break_end: '',
  }));

  useEffect(() => {
    // Apply RTL for Arabic
    if (selectedLanguage === 'ar') {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
      document.documentElement.classList.add('font-arabic');
    } else {
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = selectedLanguage;
      document.documentElement.classList.remove('font-arabic');
    }
  }, [selectedLanguage]);

  useEffect(() => {
    if (activeTab === 'sync')       loadGeneralSettings();
    if (activeTab === 'timing')     loadTimingSettings();
    if (activeTab === 'pdf')        loadPdfSettings();
    if (activeTab === 'email')      loadEmailSettings();
    if (activeTab === 'schedules')  loadSchedules();
  }, [activeTab]);

  const loadGeneralSettings = async () => {
    setLoadingSync(true);
    try {
      const settings = await api.getGeneralSettings();
      setRequireSyncConfirmation(!!settings.require_sync_confirmation);
      setValidateTimestamps(settings.validate_timestamps !== undefined ? !!settings.validate_timestamps : true);
      setAppName(settings.app_name || 'RTPointage');
      setClientName(settings.client_name || '');
      setHeartbeatEnabled(settings.device_heartbeat_enabled !== false);
      setHeartbeatIntervalMin(Math.max(1, Math.round((settings.device_heartbeat_interval_sec || 300) / 60)));
      setPunchMergeWindowMin(Math.max(0, Math.min(30, parseInt(settings.punch_merge_window_min ?? 5, 10) || 0)));
      setPortalEnabled(!!settings.portal_enabled);
    } catch (err) {
      console.error('Failed to load settings:', err);
      showNotification('error', t('failedToLoadData'));
    } finally {
      setLoadingSync(false);
    }
  };

  const saveGeneralSettings = async () => {
    setLoadingSync(true);
    try {
      const payload = {
        require_sync_confirmation: !!requireSyncConfirmation,
        validate_timestamps: !!validateTimestamps,
        timing_mode: timingMode,
        timing_enabled: timingMode !== 'off',
        app_name: (appName || 'RTPointage').trim(),
        client_name: (clientName || '').trim() || null,
        device_heartbeat_enabled: !!heartbeatEnabled,
        device_heartbeat_interval_sec: Math.max(60, Math.min(3600, (parseInt(heartbeatIntervalMin, 10) || 5) * 60)),
        punch_merge_window_min: Math.max(0, Math.min(30, parseInt(punchMergeWindowMin, 10) || 0)),
        portal_enabled: !!portalEnabled,
      };
      await api.updateGeneralSettings(payload);
      showNotification('success', t('settingsSaved'));
    } catch (err) {
      console.error('Failed to save settings:', err);
      showNotification('error', t('updateFailed'));
    } finally {
      setLoadingSync(false);
    }
  };

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // ── Email helpers ─────────────────────────────────────────────────────────
  const loadEmailSettings = async () => {
    setLoadingEmail(true);
    try {
      const d = await api.getEmailSettings();
      setEmailCfg({ ...d, password: '' }); // never show real password
      setEmailHasPassword(d.has_password || false);
    } catch (e) { showNotification('error', 'Erreur chargement SMTP'); }
    finally { setLoadingEmail(false); }
  };

  const saveEmailSettings = async () => {
    setSavingEmail(true);
    try {
      const payload = { ...emailCfg };
      if (!payload.password) delete payload.password; // keep existing
      await api.saveEmailSettings(payload);
      showNotification('success', 'Configuration SMTP sauvegardée');
      loadEmailSettings();
    } catch (e) { showNotification('error', e.message); }
    finally { setSavingEmail(false); }
  };

  const sendTestEmail = async () => {
    if (!testEmailAddr) return;
    setTestingEmail(true);
    try {
      await api.testEmail(testEmailAddr);
      showNotification('success', `Email test envoyé à ${testEmailAddr}`);
    } catch (e) { showNotification('error', e.message); }
    finally { setTestingEmail(false); }
  };

  // ── Schedule helpers ──────────────────────────────────────────────────────
  const loadSchedules = async () => {
    setLoadingSchedules(true);
    try { setSchedules(await api.getReportSchedules()); }
    catch (e) { showNotification('error', 'Erreur chargement programmes'); }
    finally { setLoadingSchedules(false); }
  };

  const toggleSchedule = async (s) => {
    try {
      const updated = await api.toggleReportSchedule(s.id);
      setSchedules(prev => prev.map(x => x.id === s.id ? updated : x));
    } catch (e) { showNotification('error', e.message); }
  };

  const deleteSchedule = async (s) => {
    if (!window.confirm(`Supprimer "${s.name}" ?`)) return;
    try {
      await api.deleteReportSchedule(s.id);
      setSchedules(prev => prev.filter(x => x.id !== s.id));
      showNotification('success', 'Programme supprimé');
    } catch (e) { showNotification('error', e.message); }
  };

  const runNow = async (s) => {
    setRunningNow(p => ({ ...p, [s.id]: true }));
    try {
      const result = await api.runScheduleNow(s.id);
      showNotification('success', result.detail || `"${s.name}" exécuté`);
      loadSchedules();
      // Reload logs so the new execution entry appears immediately
      const fresh = await api.getScheduleLogs(s.id);
      setLogs(p => ({ ...p, [s.id]: fresh }));
      setExpandedLogs(p => ({ ...p, [s.id]: true }));
    } catch (e) {
      showNotification('error', e.message || 'Échec de l\'exécution');
      // Still reload logs — the failed log entry was written to DB
      try {
        const fresh = await api.getScheduleLogs(s.id);
        setLogs(p => ({ ...p, [s.id]: fresh }));
        setExpandedLogs(p => ({ ...p, [s.id]: true }));
      } catch (_) {}
    } finally {
      setRunningNow(p => ({ ...p, [s.id]: false }));
    }
  };

  const loadLogs = async (id) => {
    if (logs[id]) { setExpandedLogs(p => ({ ...p, [id]: !p[id] })); return; }
    try {
      const data = await api.getScheduleLogs(id);
      setLogs(p => ({ ...p, [id]: data }));
      setExpandedLogs(p => ({ ...p, [id]: true }));
    } catch (e) { showNotification('error', 'Erreur chargement logs'); }
  };

  const FREQ_LABEL = {
    daily: 'Quotidien', weekly: 'Hebdomadaire',
    monthly_day: 'Mensuel (jour fixe)', monthly_last: 'Mensuel (dernier jour)',
  };
  const DAYS_FR = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const PERIOD_LABEL = {
    today: "Aujourd'hui", yesterday: 'Hier',
    current_week: 'Semaine courante', last_week: 'Semaine dernière',
    current_month: 'Mois courant', last_month: 'Mois dernier',
  };

  const languages = [
    { code: 'fr', name: t('french'), nativeName: 'Français', flag: '🇫🇷' },
    { code: 'en', name: t('english'), nativeName: 'English', flag: '🇬🇧' },
    { code: 'ar', name: t('arabic'), nativeName: 'العربية', flag: '🇸🇦' }
  ];

  const handleLanguageChange = (langCode) => {
    setSelectedLanguage(langCode);
    i18n.changeLanguage(langCode);
    localStorage.setItem('language', langCode);
    setSaved(false);
  };

  const handleSaveLanguage = () => {
    setSaved(true);
    showNotification('success', t('languageSaved'));
    setTimeout(() => setSaved(false), 3000);
  };

  // ── Timing helpers ─────────────────────────────────────────
  const loadTimingSettings = async () => {
    setLoadingTiming(true);
    try {
      const [settings, deptsRes] = await Promise.all([
        api.getGeneralSettings(),
        api.getDepartments(),
      ]);
      setTimingMode(settings.timing_mode || 'off');
      setAttendanceMode(settings.attendance_mode || 'simple');
      setEmployeeMode(settings.employee_mode || 'shared');
      const depts = deptsRes.departments || deptsRes || [];
      setDepartments(depts);
      if (depts.length > 0 && !selectedDeptId) {
        setSelectedDeptId(depts[0].id);
      }
    } catch (err) {
      console.error('Failed to load timing settings:', err);
      showNotification('error', t('failedToLoadData'));
    } finally {
      setLoadingTiming(false);
    }
  };

  useEffect(() => {
    if (selectedDeptId && activeTab === 'timing') {
      loadDeptSchedule(selectedDeptId);
    }
  }, [selectedDeptId]);

  const loadDeptSchedule = async (deptId) => {
    try {
      const res = await api.getDepartmentSchedule(deptId);
      if (res.schedule) {
        // Merge returned days into a full 7-day week
        const week = emptyWeek();
        res.schedule.forEach(d => {
          if (d.day_of_week >= 0 && d.day_of_week <= 6) week[d.day_of_week] = { ...week[d.day_of_week], ...d };
        });
        setDeptSchedule(week);
      } else {
        setDeptSchedule(null);
      }
    } catch (err) {
      console.error('Failed to load dept schedule:', err);
      setDeptSchedule(null);
    }
  };

  const saveTimingMode = async (mode) => {
    try {
      const settings = await api.getGeneralSettings();
      await api.updateGeneralSettings({ ...settings, timing_mode: mode, timing_enabled: mode !== 'off' });
      setTimingMode(mode);
      showNotification('success', t('settingsSaved'));
    } catch (err) {
      showNotification('error', t('updateFailed'));
    }
  };

  const saveAttendanceMode = async (mode) => {
    try {
      const settings = await api.getGeneralSettings();
      await api.updateGeneralSettings({ ...settings, attendance_mode: mode });
      setAttendanceMode(mode);
      showNotification('success', t('settingsSaved'));
    } catch (err) {
      showNotification('error', t('updateFailed'));
    }
  };

  const saveEmployeeMode = async (mode) => {
    try {
      const settings = await api.getGeneralSettings();
      await api.updateGeneralSettings({ ...settings, employee_mode: mode });
      setEmployeeMode(mode);
      showNotification('success', t('settingsSaved'));
    } catch (err) {
      showNotification('error', t('updateFailed'));
    }
  };

  // ── PDF Settings helpers ─────────────────────────────────────
  const loadPdfSettings = async () => {
    setLoadingPdf(true);
    try {
      const settings = await api.getGeneralSettings();
      setPdfStyle(settings.pdf_style || 'style1');
      setPdfShowOvertime(settings.pdf_show_overtime !== undefined ? !!settings.pdf_show_overtime : true);
      setPdfShowTotalWorked(settings.pdf_show_total_worked !== undefined ? !!settings.pdf_show_total_worked : true);
    } catch (err) {
      console.error('Failed to load PDF settings:', err);
      showNotification('error', t('failedToLoadData'));
    } finally {
      setLoadingPdf(false);
    }
  };

  const savePdfSettings = async () => {
    setSavingPdf(true);
    try {
      const settings = await api.getGeneralSettings();
      await api.updateGeneralSettings({ ...settings, pdf_style: pdfStyle, pdf_show_overtime: pdfShowOvertime, pdf_show_total_worked: pdfShowTotalWorked });
      showNotification('success', t('settingsSaved'));
    } catch (err) {
      console.error('Failed to save PDF settings:', err);
      showNotification('error', t('updateFailed'));
    } finally {
      setSavingPdf(false);
    }
  };

  const handleDeptDayChange = (dayIdx, field, value) => {
    setDeptSchedule(prev => {
      if (!prev) return prev;
      const copy = [...prev];
      copy[dayIdx] = { ...copy[dayIdx], [field]: value };
      return copy;
    });
  };

  const copyDeptDayToAll = (srcIdx) => {
    setDeptSchedule(prev => {
      if (!prev) return prev;
      const src = prev[srcIdx];
      return prev.map((d, i) => ({
        ...d,
        is_day_off: src.is_day_off,
        work_start: src.work_start,
        work_end: src.work_end,
        has_break: src.has_break,
        break_start: src.break_start,
        break_end: src.break_end,
      }));
    });
  };

  const saveDeptSchedule = async () => {
    if (!selectedDeptId || !deptSchedule) return;
    setSavingTiming(true);
    try {
      await api.saveDepartmentSchedule(selectedDeptId, { days: deptSchedule });
      showNotification('success', t('settingsSaved'));
    } catch (err) {
      console.error('Failed to save dept schedule:', err);
      showNotification('error', t('updateFailed'));
    } finally {
      setSavingTiming(false);
    }
  };

  const deleteDeptSchedule = async () => {
    if (!selectedDeptId) return;
    setSavingTiming(true);
    try {
      await api.deleteDepartmentSchedule(selectedDeptId);
      setDeptSchedule(null);
      showNotification('success', t('scheduleDeleted'));
    } catch (err) {
      showNotification('error', t('updateFailed'));
    } finally {
      setSavingTiming(false);
    }
  };

  return (
    <>
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Notification Toast — responsive on mobile */}
      {notification && (
        <div className={`fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md
                         z-50 flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4
                         rounded-lg shadow-lg transition-all duration-300 ${
          notification.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : notification.type === 'warning'
            ? 'bg-amber-50 text-amber-800 border border-amber-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {notification.type === 'success' ? (
            <Check className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : notification.type === 'warning' ? (
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          )}
          <span className="font-medium text-sm">{notification.message}</span>
        </div>
      )}

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight" style={{ letterSpacing: '-0.02em' }}>
            {t('generalSettings')}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('generalSettingsDesc') || 'Configuration du système, des appareils, des rapports et des comptes.'}
          </p>
        </div>
      </div>

      {/* Tabs — horizontal scroll on mobile, slate accent */}
      <div className="border-b border-slate-200 -mx-4 sm:mx-0">
        <nav className="px-4 sm:px-0 -mb-px flex gap-1 sm:gap-6 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`group flex items-center gap-2 py-3 px-3 border-b-2 font-medium text-sm
                            whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-600'}`} />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200/60">
        {activeTab === 'language' && (
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('languageSettings')}</h2>
              <p className="text-sm text-gray-600">{t('selectLanguage')}</p>
            </div>

            {/* Language Selection Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`relative p-6 rounded-lg border-2 transition-all duration-200 ${
                    selectedLanguage === lang.code
                      ? 'border-primary-500 bg-primary-50 shadow-md'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  {selectedLanguage === lang.code && (
                    <div className="absolute top-3 right-3">
                      <div className="bg-primary-500 rounded-full p-1">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  )}
                  
                  <div className="text-center">
                    <div className="text-4xl mb-3">{lang.flag}</div>
                    <h3 className="font-semibold text-gray-900 mb-1">{lang.nativeName}</h3>
                    <p className="text-sm text-gray-500">{lang.name}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Current Language Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">{t('systemLanguage')}</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {languages.find(l => l.code === selectedLanguage)?.nativeName}
                  </p>
                </div>
                <div className="text-4xl">
                  {languages.find(l => l.code === selectedLanguage)?.flag}
                </div>
              </div>
            </div>

            {/* RTL Info for Arabic */}
            {selectedLanguage === 'ar' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="text-blue-600 mt-0.5">ℹ️</div>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">تم تفعيل التصميم من اليمين لليسار</p>
                    <p>تم تطبيق خط Noto Kufi Arabic وتخطيط RTL تلقائياً للغة العربية.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveLanguage}
                className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                <Save className="w-5 h-5" />
                {t('saveChanges')}
              </button>

              {saved && (
                <div className="flex items-center gap-2 text-green-600 animate-fade-in">
                  <Check className="w-5 h-5" />
                  <span className="font-medium">{t('settingsSaved')}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('themeSettings') || 'Theme & Appearance'}</h2>
              <p className="text-sm text-gray-600">{t('themeDesc') || 'Customize theme and sidebar appearance.'}</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h3 className="text-md font-semibold text-gray-900 mb-3">{t('selectTheme') || 'Theme'}</h3>
              <div className="flex gap-3">
                <button onClick={() => setTheme('system')} className={`px-4 py-2 rounded-lg border ${theme === 'system' ? 'border-primary-600 bg-primary-50' : 'border-gray-200'}`}>{t('themeSystem') || 'System'}</button>
                <button onClick={() => setTheme('light')} className={`px-4 py-2 rounded-lg border ${theme === 'light' ? 'border-primary-600 bg-primary-50' : 'border-gray-200'}`}>{t('themeLight') || 'Light'}</button>
                <button onClick={() => setTheme('dark')} className={`px-4 py-2 rounded-lg border ${theme === 'dark' ? 'border-primary-600 bg-primary-50' : 'border-gray-200'}`}>{t('themeDark') || 'Dark'}</button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={saveAppearance} className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium">
                <Save className="w-5 h-5" />
                {t('saveChanges')}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'sync' && (
          <div className="p-6 space-y-6">

            {/* ── Branding (system name + client name) ── */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h3 className="text-md font-semibold text-gray-900 mb-1">{t('branding') || 'Identité visuelle'}</h3>
              <p className="text-sm text-gray-600 mb-3">{t('brandingDesc') || 'Affichés sur la page de connexion et dans la barre latérale.'}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('appNameLabel') || 'Nom du système'}</label>
                  <input
                    type="text"
                    value={appName}
                    onChange={e => setAppName(e.target.value)}
                    placeholder="RTPointage"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('clientNameLabel') || 'Nom du client / société'}</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder={t('clientNamePlaceholder') || 'ex. Nom de votre entreprise'}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                  />
                </div>
              </div>
            </div>

            {/* ── Device heartbeat (network reachability) ── */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="text-md font-semibold text-gray-900 mb-1">{t('deviceHeartbeat') || 'Surveillance des appareils'}</h3>
                  <p className="text-sm text-gray-600">{t('deviceHeartbeatDesc') || "Vérifie périodiquement si chaque appareil est joignable sur le réseau. N'ouvre pas de session sur l'appareil."}</p>
                </div>
                <label className="inline-flex items-center cursor-pointer shrink-0">
                  <input type="checkbox" className="sr-only peer" checked={heartbeatEnabled} onChange={e => setHeartbeatEnabled(e.target.checked)} />
                  <div className="relative w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer-checked:bg-slate-900 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
                </label>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">{t('heartbeatInterval') || 'Intervalle'}</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={heartbeatIntervalMin}
                  onChange={e => setHeartbeatIntervalMin(e.target.value)}
                  disabled={!heartbeatEnabled}
                  className="w-20 px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400 disabled:opacity-50"
                />
                <span className="text-sm text-gray-600">{t('minutes') || 'minutes'}</span>
                <span className="text-xs text-gray-400 ml-2">{t('defaultFive') || '(défaut: 5)'}</span>
              </div>
            </div>

            {/* ── Punch merge window (close-together swipes) ── */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="text-md font-semibold text-gray-900 mb-1">{t('punchMerge') || 'Fusionner les pointages rapprochés'}</h3>
                  <p className="text-sm text-gray-600">
                    {t('punchMergeDesc') ||
                      "Si un employé pointe plusieurs fois dans cet intervalle (oubli, doute), seul le premier est conservé dans les rapports."}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">{t('punchMergeWindow') || 'Fenêtre'}</label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={punchMergeWindowMin}
                  onChange={e => setPunchMergeWindowMin(e.target.value)}
                  className="w-20 px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                />
                <span className="text-sm text-gray-600">{t('minutes') || 'minutes'}</span>
                <span className="text-xs text-gray-400 ml-2">{t('punchMergeHint') || '(0 = désactivé · défaut: 5)'}</span>
              </div>
            </div>

            <div className="mb-2">
               <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('syncSettingsTitle')}</h2>
               <p className="text-sm text-gray-600">{t('syncSettingsDesc')}</p>
            </div>

             {/* Sync Confirmation Setting */}
             <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
               <div className="flex items-start justify-between">
                 <div className="flex-1">
                   <h3 className="text-md font-semibold text-gray-900 mb-2">{t('syncConfirmation')}</h3>
                   <p className="text-sm text-gray-600 mb-2">{t('syncSettingsDesc')}</p>
                   <div className="mt-3 space-y-2">
                     <label className="flex items-start gap-3 cursor-pointer">
                       <input
                         type="radio"
                         name="syncMode"
                         checked={requireSyncConfirmation}
                         onChange={() => setRequireSyncConfirmation(true)}
                         className="mt-1 w-4 h-4 text-primary-600 focus:ring-primary-500"
                       />
                       <div className="flex-1">
                         <div className="font-medium text-gray-900">{t('confirmBeforeAddingData')}</div>
                         <div className="text-sm text-gray-600">
                           {t('confirmBeforeAddingData')} 
                           <span className="text-primary-600 font-medium"> {t('recommendedDataControl')}</span>
                         </div>
                       </div>
                     </label>
                     <label className="flex items-start gap-3 cursor-pointer">
                       <input
                         type="radio"
                         name="syncMode"
                         checked={!requireSyncConfirmation}
                         onChange={() => setRequireSyncConfirmation(false)}
                         className="mt-1 w-4 h-4 text-primary-600 focus:ring-primary-500"
                       />
                       <div className="flex-1">
                         <div className="font-medium text-gray-900">{t('addAutomatically')}</div>
                         <div className="text-sm text-gray-600">
                           {t('addAutomatically')} {t('fasterLessControl')}
                         </div>
                       </div>
                     </label>
                   </div>
                 </div>
               </div>
             </div>

             {/* Timestamp Validation Setting */}
             <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
               <div className="flex items-center justify-between">
                 <div className="flex-1">
                   <h3 className="text-md font-semibold text-gray-900 mb-2">{t('timestampValidationTitle')}</h3>
                   <p className="text-sm text-gray-600">{t('timestampValidationDesc')}</p>
                 </div>
                 <div className="flex items-center gap-2 ml-4">
                   <label className="text-sm font-medium text-gray-700">{t('enabled')}</label>
                   <button
                     onClick={() => setValidateTimestamps(prev => !prev)}
                     className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${validateTimestamps ? 'bg-primary-600' : 'bg-gray-300'}`}
                     aria-pressed={validateTimestamps}
                   >
                     <span
                       className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${validateTimestamps ? 'translate-x-6' : 'translate-x-1'}`}
                     />
                   </button>
                 </div>
               </div>
             </div>

            {/* Employee portal — super admin only (distinct feature, kept last) */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-md font-semibold text-gray-900">{t('portalFeature') || 'Espace employé (portail)'}</h3>
                  <p className="text-sm text-gray-600 mt-0.5">
                    {t('portalFeatureDesc') || "Permet aux employés de consulter leurs pointages sur /portal-login. Réservé au super administrateur."}
                  </p>
                </div>
                <button type="button" onClick={() => setPortalEnabled(v => !v)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${portalEnabled ? 'bg-primary-600' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${portalEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {portalEnabled && (
                <div className="mt-2 text-xs text-amber-800">
                  {t('portalEnabledHint') || "Quand activé, le portail est joignable à /portal-login. Mot de passe initial = prénom de l'employé."}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={saveGeneralSettings}
                disabled={loadingSync}
                className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50"
              >
                {loadingSync ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {loadingSync ? t('saving') : t('saveChanges')}
              </button>
            </div>
          </div>
        )}

        {/* ── PDF Settings Tab ── */}
        {activeTab === 'pdf' && (
          <div className="p-6 space-y-6">
            <div className="mb-2">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('pdfSettingsTitle')}</h2>
              <p className="text-sm text-gray-600">{t('pdfSettingsDesc')}</p>
            </div>

            {loadingPdf ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
              </div>
            ) : (
              <>
                {/* PDF Style Selection */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="text-md font-semibold text-gray-900 mb-3">{t('pdfStyleTitle')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Style 1 */}
                    <button
                      onClick={() => setPdfStyle('style1')}
                      className={`relative p-4 rounded-lg border-2 transition-all duration-200 text-left ${
                        pdfStyle === 'style1'
                          ? 'border-blue-500 bg-blue-50 shadow-md'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                      }`}
                    >
                      {pdfStyle === 'style1' && (
                        <div className="absolute top-3 right-3">
                          <div className="bg-blue-500 rounded-full p-1">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        </div>
                      )}
                      <div className="mb-3">
                        {/* Mini preview — Style 1 */}
                        <div className="w-full h-20 rounded border border-gray-200 overflow-hidden">
                          <div className="h-4 bg-[#1e3a5f]"></div>
                          <div className="flex gap-px mt-1 px-1">
                            <div className="h-2 flex-1 bg-gray-200 rounded-sm"></div>
                            <div className="h-2 flex-1 bg-gray-200 rounded-sm"></div>
                            <div className="h-2 flex-1 bg-gray-200 rounded-sm"></div>
                          </div>
                          <div className="flex gap-px mt-1 px-1">
                            <div className="h-2 flex-1 bg-[#f1f5f9] rounded-sm"></div>
                            <div className="h-2 flex-1 bg-[#f1f5f9] rounded-sm"></div>
                            <div className="h-2 flex-1 bg-[#f1f5f9] rounded-sm"></div>
                          </div>
                          <div className="flex gap-px mt-1 px-1">
                            <div className="h-2 flex-1 bg-gray-200 rounded-sm"></div>
                            <div className="h-2 flex-1 bg-gray-200 rounded-sm"></div>
                            <div className="h-2 flex-1 bg-gray-200 rounded-sm"></div>
                          </div>
                        </div>
                      </div>
                      <h4 className="font-semibold text-gray-900">{t('pdfStyle1')}</h4>
                      <p className="text-sm text-gray-500 mt-1">{t('pdfStyle1Desc')}</p>
                    </button>

                    {/* Style 2 */}
                    <button
                      onClick={() => setPdfStyle('style2')}
                      className={`relative p-4 rounded-lg border-2 transition-all duration-200 text-left ${
                        pdfStyle === 'style2'
                          ? 'border-emerald-500 bg-emerald-50 shadow-md'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                      }`}
                    >
                      {pdfStyle === 'style2' && (
                        <div className="absolute top-3 right-3">
                          <div className="bg-emerald-500 rounded-full p-1">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        </div>
                      )}
                      <div className="mb-3">
                        {/* Mini preview — Style 2 */}
                        <div className="w-full h-20 rounded border border-gray-200 overflow-hidden bg-white">
                          <div className="h-0.5 bg-emerald-600 mt-3 mx-2"></div>
                          <div className="flex gap-px mt-1 px-2">
                            <div className="h-2 flex-1 text-[6px] text-emerald-700 font-bold leading-none">A</div>
                            <div className="h-2 flex-1 text-[6px] text-emerald-700 font-bold leading-none">B</div>
                            <div className="h-2 flex-1 text-[6px] text-emerald-700 font-bold leading-none">C</div>
                          </div>
                          <div className="h-0.5 bg-emerald-600 mx-2"></div>
                          <div className="flex gap-px mt-1 px-2">
                            <div className="h-2 flex-1 bg-gray-100 rounded-sm"></div>
                            <div className="h-2 flex-1 bg-gray-100 rounded-sm"></div>
                            <div className="h-2 flex-1 bg-gray-100 rounded-sm"></div>
                          </div>
                          <div className="flex gap-px mt-1 px-2">
                            <div className="h-2 flex-1 bg-gray-100 rounded-sm"></div>
                            <div className="h-2 flex-1 bg-gray-100 rounded-sm"></div>
                            <div className="h-2 flex-1 bg-gray-100 rounded-sm"></div>
                          </div>
                        </div>
                      </div>
                      <h4 className="font-semibold text-gray-900">{t('pdfStyle2')}</h4>
                      <p className="text-sm text-gray-500 mt-1">{t('pdfStyle2Desc')}</p>
                    </button>
                  </div>
                </div>

                {/* Overtime Toggle */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-md font-semibold text-gray-900 mb-1">{t('pdfShowOvertime')}</h3>
                      <p className="text-sm text-gray-600">{t('pdfShowOvertimeDesc')}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => setPdfShowOvertime(prev => !prev)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${pdfShowOvertime ? 'bg-primary-600' : 'bg-gray-300'}`}
                        aria-pressed={pdfShowOvertime}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${pdfShowOvertime ? 'translate-x-6' : 'translate-x-1'}`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Total Worked Toggle */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-md font-semibold text-gray-900 mb-1">{t('pdfShowTotalWorked')}</h3>
                      <p className="text-sm text-gray-600">{t('pdfShowTotalWorkedDesc')}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => setPdfShowTotalWorked(prev => !prev)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${pdfShowTotalWorked ? 'bg-primary-600' : 'bg-gray-300'}`}
                        aria-pressed={pdfShowTotalWorked}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${pdfShowTotalWorked ? 'translate-x-6' : 'translate-x-1'}`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={savePdfSettings}
                    disabled={savingPdf}
                    className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50"
                  >
                    {savingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {savingPdf ? t('saving') : t('saveChanges')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Timing Tab ── */}
        {activeTab === 'timing' && (
          <div className="p-6 space-y-6">
            <div className="mb-2">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('timingSettingsTitle')}</h2>
              <p className="text-sm text-gray-600">{t('timingSettingsDesc')}</p>
            </div>

            {/* Timing Mode Selection */}
            <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
              <h3 className="text-md font-semibold text-gray-900 mb-3">{t('timingModeTitle')}</h3>
              <div className="space-y-3">
                {/* Off */}
                <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:border-gray-300"
                  style={{ borderColor: timingMode === 'off' ? 'var(--color-primary-500)' : undefined, backgroundColor: timingMode === 'off' ? 'var(--color-primary-50, #eff6ff)' : undefined }}>
                  <input type="radio" name="timingMode" value="off" checked={timingMode === 'off'}
                    onChange={() => saveTimingMode('off')} className="mt-1 w-4 h-4 text-primary-600 focus:ring-primary-500" />
                  <div>
                    <div className="font-medium text-gray-900">{t('timingModeOff')}</div>
                    <div className="text-sm text-gray-500">{t('timingModeOffDesc')}</div>
                  </div>
                </label>

                {/* Per Employee */}
                <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:border-gray-300"
                  style={{ borderColor: timingMode === 'employee' ? 'var(--color-primary-500)' : undefined, backgroundColor: timingMode === 'employee' ? 'var(--color-primary-50, #eff6ff)' : undefined }}>
                  <input type="radio" name="timingMode" value="employee" checked={timingMode === 'employee'}
                    onChange={() => saveTimingMode('employee')} className="mt-1 w-4 h-4 text-primary-600 focus:ring-primary-500" />
                  <div>
                    <div className="font-medium text-gray-900">{t('timingModeEmployee')}</div>
                    <div className="text-sm text-gray-500">{t('timingModeEmployeeDesc')}</div>
                  </div>
                </label>

                {/* Per Department */}
                <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:border-gray-300"
                  style={{ borderColor: timingMode === 'department' ? 'var(--color-primary-500)' : undefined, backgroundColor: timingMode === 'department' ? 'var(--color-primary-50, #eff6ff)' : undefined }}>
                  <input type="radio" name="timingMode" value="department" checked={timingMode === 'department'}
                    onChange={() => saveTimingMode('department')} className="mt-1 w-4 h-4 text-primary-600 focus:ring-primary-500" />
                  <div>
                    <div className="font-medium text-gray-900">{t('timingModeDepartment')}</div>
                    <div className="text-sm text-gray-500">{t('timingModeDepartmentDesc')}</div>
                  </div>
                </label>

                {/* Both (Employee priority, Department fallback) */}
                <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:border-gray-300"
                  style={{ borderColor: timingMode === 'both' ? 'var(--color-primary-500)' : undefined, backgroundColor: timingMode === 'both' ? 'var(--color-primary-50, #eff6ff)' : undefined }}>
                  <input type="radio" name="timingMode" value="both" checked={timingMode === 'both'}
                    onChange={() => saveTimingMode('both')} className="mt-1 w-4 h-4 text-primary-600 focus:ring-primary-500" />
                  <div>
                    <div className="font-medium text-gray-900">{t('timingModeBoth')}</div>
                    <div className="text-sm text-gray-500">{t('timingModeBothDesc')}</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Guard / Night Shift Info */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-800">
                  <p className="font-semibold mb-1">{t('guardShiftAlwaysActive')}</p>
                  <p>{t('guardShiftAlwaysActiveDesc')}</p>
                </div>
              </div>
            </div>

            {/* Attendance Mode Selection */}
            <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
              <h3 className="text-md font-semibold text-gray-900 mb-1">{t('attendanceModeTitle')}</h3>
              <p className="text-sm text-gray-500 mb-3">{t('attendanceModeDesc')}</p>
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:border-gray-300"
                  style={{ borderColor: attendanceMode === 'simple' ? 'var(--color-primary-500)' : undefined, backgroundColor: attendanceMode === 'simple' ? 'var(--color-primary-50, #eff6ff)' : undefined }}>
                  <input type="radio" name="attendanceMode" value="simple" checked={attendanceMode === 'simple'}
                    onChange={() => saveAttendanceMode('simple')} className="mt-1 w-4 h-4 text-primary-600 focus:ring-primary-500" />
                  <div>
                    <div className="font-medium text-gray-900">{t('attendanceModeSimple')}</div>
                    <div className="text-sm text-gray-500">{t('attendanceModeSimpleDesc')}</div>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:border-gray-300"
                  style={{ borderColor: attendanceMode === 'strict' ? 'var(--color-primary-500)' : undefined, backgroundColor: attendanceMode === 'strict' ? 'var(--color-primary-50, #eff6ff)' : undefined }}>
                  <input type="radio" name="attendanceMode" value="strict" checked={attendanceMode === 'strict'}
                    onChange={() => saveAttendanceMode('strict')} className="mt-1 w-4 h-4 text-primary-600 focus:ring-primary-500" />
                  <div>
                    <div className="font-medium text-gray-900">{t('attendanceModeStrict')}</div>
                    <div className="text-sm text-gray-500">{t('attendanceModeStrictDesc')}</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Employee Mode Selection */}
            <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
              <h3 className="text-md font-semibold text-gray-900 mb-1">{t('employeeModeTitle')}</h3>
              <p className="text-sm text-gray-500 mb-3">{t('employeeModeDesc')}</p>
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:border-gray-300"
                  style={{ borderColor: employeeMode === 'shared' ? 'var(--color-primary-500)' : undefined, backgroundColor: employeeMode === 'shared' ? 'var(--color-primary-50, #eff6ff)' : undefined }}>
                  <input type="radio" name="employeeMode" value="shared" checked={employeeMode === 'shared'}
                    onChange={() => saveEmployeeMode('shared')} className="mt-1 w-4 h-4 text-primary-600 focus:ring-primary-500" />
                  <div>
                    <div className="font-medium text-gray-900">{t('employeeModeShared')}</div>
                    <div className="text-sm text-gray-500">{t('employeeModeSharedDesc')}</div>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:border-gray-300"
                  style={{ borderColor: employeeMode === 'separate' ? 'var(--color-primary-500)' : undefined, backgroundColor: employeeMode === 'separate' ? 'var(--color-primary-50, #eff6ff)' : undefined }}>
                  <input type="radio" name="employeeMode" value="separate" checked={employeeMode === 'separate'}
                    onChange={() => saveEmployeeMode('separate')} className="mt-1 w-4 h-4 text-primary-600 focus:ring-primary-500" />
                  <div>
                    <div className="font-medium text-gray-900">{t('employeeModeSeparate')}</div>
                    <div className="text-sm text-gray-500">{t('employeeModeSeparateDesc')}</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Department schedule editor (shown when mode involves departments) */}
            {(timingMode === 'department' || timingMode === 'both') && (
              <div className="border-t pt-4">
                <h3 className="text-md font-semibold text-gray-900 mb-2">{t('departmentSchedule')}</h3>
                <p className="text-sm text-gray-600 mb-4">{t('departmentScheduleDesc')}</p>

                {departments.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">{t('noDepartments')}</p>
                ) : (
                  <div className="mb-4">
                    <select
                      value={selectedDeptId || ''}
                      onChange={(e) => setSelectedDeptId(Number(e.target.value))}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedDeptId && (
                  <>
                    {!deptSchedule ? (
                      <div className="text-center py-6">
                        <p className="text-sm text-gray-500 mb-3">{t('noScheduleYet')}</p>
                        <button
                          onClick={() => setDeptSchedule(emptyWeek())}
                          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
                        >
                          {t('createSchedule')}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {deptSchedule.map((day, idx) => (
                          <div key={idx} className={`flex flex-wrap items-center gap-3 p-3 rounded-lg border ${day.is_day_off ? 'bg-gray-100 border-gray-200' : 'bg-white border-gray-200'}`}>
                            <div className="w-24 font-medium text-sm text-gray-700">{t(DAY_KEYS[idx])}</div>

                            <label className="flex items-center gap-1 text-sm cursor-pointer">
                              <input type="checkbox" checked={day.is_day_off}
                                onChange={(e) => handleDeptDayChange(idx, 'is_day_off', e.target.checked)}
                                className="w-4 h-4 text-red-600 rounded" />
                              <span className="text-gray-600">{t('dayOff')}</span>
                            </label>

                            {!day.is_day_off && (
                              <>
                                <input type="time" value={day.work_start || ''} onChange={(e) => handleDeptDayChange(idx, 'work_start', e.target.value)} className="px-2 py-1 border rounded text-sm w-28" />
                                <span className="text-gray-400">-</span>
                                <input type="time" value={day.work_end || ''} onChange={(e) => handleDeptDayChange(idx, 'work_end', e.target.value)} className="px-2 py-1 border rounded text-sm w-28" />

                                <label className="flex items-center gap-1 text-sm cursor-pointer ml-2">
                                  <input type="checkbox" checked={day.has_break} onChange={(e) => handleDeptDayChange(idx, 'has_break', e.target.checked)} className="w-4 h-4 text-primary-600 rounded" />
                                  <span className="text-gray-600">{t('hasBreak')}</span>
                                </label>

                                {day.has_break && (
                                  <>
                                    <input type="time" value={day.break_start || ''} onChange={(e) => handleDeptDayChange(idx, 'break_start', e.target.value)} className="px-2 py-1 border rounded text-sm w-28" />
                                    <span className="text-gray-400">-</span>
                                    <input type="time" value={day.break_end || ''} onChange={(e) => handleDeptDayChange(idx, 'break_end', e.target.value)} className="px-2 py-1 border rounded text-sm w-28" />
                                  </>
                                )}

                                <button onClick={() => copyDeptDayToAll(idx)} title={t('copyToAllDays')} className="p-1 text-gray-400 hover:text-primary-600"><Copy className="w-4 h-4" /></button>
                              </>
                            )}
                          </div>
                        ))}

                        <div className="flex items-center gap-3 pt-2">
                          <button onClick={saveDeptSchedule} disabled={savingTiming}
                            className="flex items-center gap-2 px-5 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50">
                            {savingTiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {t('saveChanges')}
                          </button>
                          <button onClick={deleteDeptSchedule} disabled={savingTiming}
                            className="px-5 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 text-sm font-medium disabled:opacity-50">
                            {t('deleteSchedule')}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Info about employee schedules */}
            {(timingMode === 'employee' || timingMode === 'both') && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-800">
                    <p className="font-semibold mb-1">{t('employeeScheduleInfo')}</p>
                    <p>{t('employeeScheduleInfoDesc')}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════ EMAIL SMTP TAB ══════════ */}
        {activeTab === 'email' && (
          <div className="p-6 space-y-6">
            <div className="mb-2">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Configuration SMTP</h2>
              <p className="text-sm text-gray-600">Serveur d'email sortant pour l'envoi automatique des rapports PDF.</p>
            </div>

            {loadingEmail ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
              </div>
            ) : (
              <>
                {/* ── Activation ── */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-md font-semibold text-gray-900 mb-1">Activer l'envoi automatique</h3>
                      <p className="text-sm text-gray-600">Les programmes d'envoi ne s'exécuteront que si cette option est activée.</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <label className="text-sm font-medium text-gray-700">{emailCfg.is_enabled ? 'Activé' : 'Désactivé'}</label>
                      <button
                        onClick={() => setEmailCfg(c => ({ ...c, is_enabled: !c.is_enabled }))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${emailCfg.is_enabled ? 'bg-primary-600' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${emailCfg.is_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Server connection ── */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="text-md font-semibold text-gray-900 mb-3">Serveur SMTP</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2 flex gap-4">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Hôte SMTP</label>
                        <input
                          value={emailCfg.host || ''}
                          onChange={e => setEmailCfg(c => ({ ...c, host: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                          placeholder="smtp.gmail.com"
                        />
                      </div>
                      <div className="w-28">
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Port</label>
                        <input
                          type="number"
                          value={emailCfg.port}
                          onChange={e => setEmailCfg(c => ({ ...c, port: parseInt(e.target.value) || 587 }))}
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Utilisateur SMTP</label>
                      <input
                        value={emailCfg.username || ''}
                        onChange={e => setEmailCfg(c => ({ ...c, username: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                        placeholder="user@example.com"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Mot de passe
                        {emailHasPassword && (
                          <span className="ml-1.5 text-xs text-gray-400 font-normal">(déjà configuré — laisser vide pour conserver)</span>
                        )}
                      </label>
                      <input
                        type="password"
                        value={emailCfg.password || ''}
                        onChange={e => setEmailCfg(c => ({ ...c, password: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                        placeholder={emailHasPassword ? '••••••••' : 'Mot de passe'}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom de l'expéditeur</label>
                      <input
                        value={emailCfg.from_name || ''}
                        onChange={e => setEmailCfg(c => ({ ...c, from_name: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                        placeholder="RT Connect"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Adresse expéditeur</label>
                      <input
                        type="email"
                        value={emailCfg.from_address || ''}
                        onChange={e => setEmailCfg(c => ({ ...c, from_address: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                        placeholder="rapports@example.com"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Chiffrement</label>
                      <div className="flex gap-3">
                        {[
                          { k: 'use_tls', l: 'STARTTLS', sub: 'Port 587 — recommandé' },
                          { k: 'use_ssl', l: 'SSL / TLS', sub: 'Port 465' },
                        ].map(opt => (
                          <label
                            key={opt.k}
                            className={`flex items-start gap-3 flex-1 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                              emailCfg[opt.k]
                                ? 'border-primary-500 bg-primary-50'
                                : 'border-gray-200 bg-white hover:border-gray-300'}`}
                          >
                            <input
                              type="checkbox"
                              checked={!!emailCfg[opt.k]}
                              onChange={() => setEmailCfg(c => ({ ...c, [opt.k]: !c[opt.k] }))}
                              className="mt-0.5 w-4 h-4 text-primary-600 focus:ring-primary-500"
                            />
                            <div>
                              <div className="font-medium text-gray-900 text-sm">{opt.l}</div>
                              <div className="text-xs text-gray-500 mt-0.5">{opt.sub}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Device health alerts ── */}
                <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-md font-semibold text-gray-900">{t('deviceAlerts') || 'Alertes appareils'}</h3>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {t('deviceAlertsDesc') || 'Email envoyé quand un appareil reste hors ligne plus de 30 minutes. Utilise la configuration SMTP ci-dessus.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEmailCfg(c => ({ ...c, alerts_enabled: !c.alerts_enabled }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${emailCfg.alerts_enabled ? 'bg-primary-600' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${emailCfg.alerts_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {t('alertsRecipient') || "Email destinataire des alertes"}
                    </label>
                    <input
                      type="email"
                      value={emailCfg.alerts_recipient_email || ''}
                      onChange={e => setEmailCfg(c => ({ ...c, alerts_recipient_email: e.target.value }))}
                      disabled={!emailCfg.alerts_enabled}
                      placeholder="alerts@example.com"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {t('alertsRecipientHint') || "Distinct des destinataires des rapports planifiés."}
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await api.post('/email-settings/test-alert');
                          showNotification('success', res.data?.detail || 'Test alert envoyé');
                        } catch (e) {
                          showNotification('error', e?.response?.data?.detail || e.message);
                        }
                      }}
                      disabled={!emailCfg.alerts_enabled || !emailCfg.alerts_recipient_email}
                      className="mt-2 text-sm px-3 py-1.5 border border-primary-300 text-primary-700 rounded hover:bg-primary-50 disabled:opacity-50"
                    >
                      {t('sendTestAlert') || "Envoyer une alerte de test"}
                    </button>
                  </div>
                </div>

                {/* ── Test email ── */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="text-md font-semibold text-gray-900 mb-1">Email de test</h3>
                  <p className="text-sm text-gray-600 mb-3">Vérifiez votre configuration en envoyant un message de test.</p>
                  <div className="flex gap-3">
                    <input
                      type="email"
                      value={testEmailAddr}
                      onChange={e => setTestEmailAddr(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !testingEmail && testEmailAddr && sendTestEmail()}
                      className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                      placeholder="destinataire@example.com"
                    />
                    <button
                      onClick={sendTestEmail}
                      disabled={testingEmail || !testEmailAddr}
                      className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
                    >
                      {testingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                      Envoyer le test
                    </button>
                  </div>
                </div>

                {/* ── Save ── */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={saveEmailSettings}
                    disabled={savingEmail}
                    className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50"
                  >
                    {savingEmail ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {savingEmail ? 'Enregistrement…' : 'Enregistrer la configuration'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════ SCHEDULES TAB ══════════ */}
        {activeTab === 'schedules' && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Programmes d'envoi automatique</h2>
                <p className="text-sm text-gray-600">Rapports PDF envoyés automatiquement par email selon une planification.</p>
              </div>
              <button
                onClick={() => setScheduleModal('new')}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors"
              >
                <Plus className="w-4 h-4" /> Nouveau programme
              </button>
            </div>

            {loadingSchedules ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
              </div>
            ) : schedules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                <Calendar className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm font-medium text-gray-500">Aucun programme configuré</p>
                <p className="text-xs mt-1 text-gray-400">Créez votre premier programme d'envoi automatique</p>
              </div>
            ) : (
              <div className="space-y-3">
                {schedules.map(s => (
                  <div key={s.id} className={`border rounded-lg overflow-hidden transition-all ${s.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
                    {/* Card header */}
                    <div className="flex items-center gap-4 px-4 py-4 bg-white">
                      {/* Active toggle */}
                      <button
                        onClick={() => toggleSchedule(s)}
                        className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${s.is_active ? 'bg-primary-600' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${s.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-gray-900 truncate">{s.name}</span>
                          <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {s.is_active ? 'Actif' : 'Inactif'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {FREQ_LABEL[s.schedule_type] || s.schedule_type} — {String(s.send_hour).padStart(2,'0')}:{String(s.send_minute).padStart(2,'0')}
                            {s.schedule_type === 'weekly' && ` (${DAYS_FR[s.week_day] || '?'})`}
                            {s.schedule_type === 'monthly_day' && ` (jour ${s.month_day})`}
                          </span>
                          <span>·</span>
                          <span>{PERIOD_LABEL[s.data_period] || s.data_period}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{(s.recipients || []).length} destinataire(s)</span>
                          {s.next_run_at && s.is_active && (
                            <><span>·</span><span className="text-primary-600">Prochain: {new Date(s.next_run_at).toLocaleString('fr-FR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span></>
                          )}
                          {s.last_run_at && (
                            <><span>·</span><span>Dernier: {new Date(s.last_run_at).toLocaleString('fr-FR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span></>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => runNow(s)} disabled={!!runningNow[s.id]} title="Exécuter maintenant"
                          className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50">
                          {runningNow[s.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button onClick={() => setScheduleModal(s)} title="Modifier"
                          className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => loadLogs(s.id)} title="Historique"
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          {expandedLogs[s.id] ? <ChevronUp className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button onClick={() => deleteSchedule(s)} title="Supprimer"
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Execution log (expandable) */}
                    {expandedLogs[s.id] && logs[s.id] && (
                      <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Historique d'exécution</p>
                        {logs[s.id].length === 0 ? (
                          <p className="text-sm text-gray-400">Aucune exécution enregistrée</p>
                        ) : (
                          <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            {logs[s.id].map(log => (
                              <div key={log.id} className={`flex items-start gap-3 text-sm px-3 py-2.5 rounded-lg border ${
                                log.status === 'success'
                                  ? 'bg-green-50 border-green-100 text-green-800'
                                  : 'bg-red-50 border-red-100 text-red-800'}`}>
                                <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${log.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium">{new Date(log.executed_at).toLocaleString('fr-FR')}</span>
                                  {log.status === 'success' && (
                                    <span className="ml-2 text-green-600 font-normal">→ {log.recipients_count} envoi(s)</span>
                                  )}
                                  {log.error_message && (
                                    <p className="mt-0.5 text-red-600 text-xs truncate">{log.error_message}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {/* Schedule wizard modal */}
    {scheduleModal && (
      <ScheduleModal
        schedule={scheduleModal === 'new' ? null : scheduleModal}
        onClose={() => setScheduleModal(null)}
        onSaved={() => { setScheduleModal(null); loadSchedules(); showNotification('success', 'Programme sauvegardé'); }}
      />
    )}
    </>
  );
}

export default GeneralSettings;

