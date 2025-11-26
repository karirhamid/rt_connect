import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Save, Check, Clock, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import api from '../services/api';

function GeneralSettings() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState('language');
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language || 'fr');
  const [selectedTimezone, setSelectedTimezone] = useState('0');
  const [devices, setDevices] = useState([]);
  const [deviceTimes, setDeviceTimes] = useState({});
  const [deviceTimezones, setDeviceTimezones] = useState({});
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [loadingDeviceTimes, setLoadingDeviceTimes] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notification, setNotification] = useState(null);

  const tabs = [
    { id: 'language', name: 'Language', icon: Globe },
    { id: 'regional', name: 'Time & Timezone', icon: Clock },
    { id: 'sync', name: 'Sync', icon: RefreshCw },
  ];

  // Sync settings state
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [syncInterval, setSyncInterval] = useState(300);
  const [requireSyncConfirmation, setRequireSyncConfirmation] = useState(true);
  const [validateTimestamps, setValidateTimestamps] = useState(true);
  const [loadingSync, setLoadingSync] = useState(false);

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
    if (activeTab === 'regional') {
      loadDevices();
    }
    if (activeTab === 'sync') {
      loadGeneralSettings();
    }
  }, [activeTab]);

  const loadGeneralSettings = async () => {
    setLoadingSync(true);
    try {
      const settings = await api.getGeneralSettings();
      setSyncEnabled(!!settings.sync_enabled);
      setSyncInterval(Number(settings.sync_interval_sec || 300));
      setRequireSyncConfirmation(!!settings.require_sync_confirmation);
      setValidateTimestamps(settings.validate_timestamps !== undefined ? !!settings.validate_timestamps : true);
    } catch (err) {
      console.error('Failed to load settings:', err);
      showNotification('error', 'Failed to load general settings');
    } finally {
      setLoadingSync(false);
    }
  };

  const saveGeneralSettings = async () => {
    setLoadingSync(true);
    try {
      const payload = { 
        sync_enabled: !!syncEnabled, 
        sync_interval_sec: Math.max(60, Number(syncInterval||300)),
        require_sync_confirmation: !!requireSyncConfirmation,
        validate_timestamps: !!validateTimestamps
      };
      await api.updateGeneralSettings(payload);
      showNotification('success', 'Sync settings saved');
    } catch (err) {
      console.error('Failed to save settings:', err);
      showNotification('error', 'Failed to save sync settings');
    } finally {
      setLoadingSync(false);
    }
  };

  const loadDevices = async () => {
    setLoadingDevices(true);
    try {
      const response = await api.getDevices();
      const deviceList = response.devices || [];
      setDevices(deviceList);
      
      // Load time for each device
      deviceList.forEach(device => {
        loadDeviceTime(device.id);
      });
    } catch (error) {
      console.error('Failed to load devices:', error);
      showNotification('error', 'Failed to load devices');
    } finally {
      setLoadingDevices(false);
    }
  };

  const loadDeviceTime = async (deviceId) => {
    setLoadingDeviceTimes(prev => ({ ...prev, [deviceId]: true }));
    try {
      const response = await api.getDeviceTime(deviceId);
      setDeviceTimes(prev => ({
        ...prev,
        [deviceId]: response
      }));
      
      // Calculate timezone offset from device time
      if (response.device_time) {
        const deviceTime = new Date(response.device_time);
        const utcTime = new Date();
        const offsetMinutes = (deviceTime - utcTime) / (1000 * 60);
        const offsetHours = Math.round(offsetMinutes / 60);
        setDeviceTimezones(prev => ({
          ...prev,
          [deviceId]: offsetHours.toString()
        }));
      }
    } catch (error) {
      console.error(`Failed to load time for device ${deviceId}:`, error);
      showNotification('error', `Failed to load time for device`);
    } finally {
      setLoadingDeviceTimes(prev => ({ ...prev, [deviceId]: false }));
    }
  };

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const timezones = [
    { offset: '-12', name: '(UTC-12:00) International Date Line West' },
    { offset: '-11', name: '(UTC-11:00) Coordinated Universal Time-11' },
    { offset: '-10', name: '(UTC-10:00) Hawaii' },
    { offset: '-9', name: '(UTC-09:00) Alaska' },
    { offset: '-8', name: '(UTC-08:00) Pacific Time (US & Canada)' },
    { offset: '-7', name: '(UTC-07:00) Mountain Time (US & Canada)' },
    { offset: '-6', name: '(UTC-06:00) Central Time (US & Canada)' },
    { offset: '-5', name: '(UTC-05:00) Eastern Time (US & Canada)' },
    { offset: '-4', name: '(UTC-04:00) Atlantic Time (Canada)' },
    { offset: '-3', name: '(UTC-03:00) Buenos Aires, Georgetown' },
    { offset: '-2', name: '(UTC-02:00) Mid-Atlantic' },
    { offset: '-1', name: '(UTC-01:00) Azores' },
    { offset: '0', name: '(UTC+00:00) London, Lisbon, Casablanca' },
    { offset: '1', name: '(UTC+01:00) Paris, Brussels, Madrid, Algiers' },
    { offset: '2', name: '(UTC+02:00) Cairo, Athens, Istanbul' },
    { offset: '3', name: '(UTC+03:00) Moscow, Kuwait, Riyadh' },
    { offset: '4', name: '(UTC+04:00) Abu Dhabi, Muscat' },
    { offset: '5', name: '(UTC+05:00) Islamabad, Karachi, Tashkent' },
    { offset: '5.5', name: '(UTC+05:30) Mumbai, New Delhi' },
    { offset: '6', name: '(UTC+06:00) Dhaka, Almaty' },
    { offset: '7', name: '(UTC+07:00) Bangkok, Hanoi, Jakarta' },
    { offset: '8', name: '(UTC+08:00) Beijing, Singapore, Perth' },
    { offset: '9', name: '(UTC+09:00) Tokyo, Seoul, Osaka' },
    { offset: '10', name: '(UTC+10:00) Sydney, Melbourne, Brisbane' },
    { offset: '11', name: '(UTC+11:00) Solomon Islands, New Caledonia' },
    { offset: '12', name: '(UTC+12:00) Auckland, Wellington, Fiji' },
  ];

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
    showNotification('success', 'Language settings saved successfully!');
    setTimeout(() => setSaved(false), 3000);
  };

  const handleSaveDeviceTimezone = async (deviceId) => {
    const offset = parseFloat(deviceTimezones[deviceId] || '0');
    setSaving(true);
    try {
      await api.setDeviceTime(deviceId, offset);
      showNotification('success', 'Device timezone updated successfully!');
      
      // Reload device time
      await loadDeviceTime(deviceId);
    } catch (error) {
      console.error('Failed to save timezone:', error);
      showNotification('error', 'Failed to update device timezone');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAllTimezones = async () => {
    setSaving(true);
    try {
      const offset = parseFloat(selectedTimezone);
      const response = await api.setAllDevicesTime(offset);
      
      if (response.failed && response.failed.length > 0) {
        showNotification('warning', `Time updated for ${response.successful.length} devices. ${response.failed.length} failed.`);
      } else {
        showNotification('success', `Time zone updated successfully for all ${response.successful.length} devices!`);
      }
      
      // Reload device times
      devices.forEach(device => loadDeviceTime(device.id));
    } catch (error) {
      console.error('Failed to save timezone:', error);
      showNotification('error', 'Failed to update device time zones');
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshDeviceTime = async (deviceId) => {
    await loadDeviceTime(deviceId);
    showNotification('success', 'Device time refreshed');
  };

  return (
    <div className="space-y-6">
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-6 py-4 rounded-lg shadow-lg transform transition-all duration-300 ${
          notification.type === 'success' 
            ? 'bg-green-50 text-green-800 border border-green-200' 
            : notification.type === 'warning'
            ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {notification.type === 'success' ? (
            <Check className="w-5 h-5 text-green-600" />
          ) : notification.type === 'warning' ? (
            <AlertCircle className="w-5 h-5 text-yellow-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600" />
          )}
          <span className="font-medium">{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">General Settings</h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-5 h-5" />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg shadow">
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

        {activeTab === 'regional' && (
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Time & Timezone Settings</h2>
              <p className="text-sm text-gray-600">Configure timezone for all devices. Changes will be applied to all connected devices.</p>
            </div>

              {/* Bulk Timezone Selection */}
              <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-md font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-600" />
                  Apply Timezone to All Devices
                </h3>
                <p className="text-sm text-gray-600 mb-3">Set the same timezone for all devices at once</p>
                <div className="flex gap-3">
                  <select
                    value={selectedTimezone}
                    onChange={(e) => setSelectedTimezone(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    {timezones.map((tz) => (
                      <option key={tz.offset} value={tz.offset}>{tz.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleSaveAllTimezones}
                    disabled={saving || devices.length === 0}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {saving ? 'Applying...' : 'Apply to All'}
                  </button>
                </div>
              </div>              {/* Individual Device Timezone Configuration */}
              <div className="mb-6">
                <h3 className="text-md font-semibold text-gray-900 mb-3">Individual Device Timezones</h3>
                
                {loadingDevices ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                  </div>
                ) : devices.length === 0 ? (
                  <div className="bg-gray-50 rounded-lg p-6 text-center">
                    <Clock className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-600">No devices registered</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {devices.map((device) => (
                      <div key={device.id} className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-gray-900">{device.name}</h4>
                              {loadingDeviceTimes[device.id] && (
                                <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
                              )}
                            </div>
                            <p className="text-sm text-gray-500">{device.ip}:{device.port}</p>
                            {deviceTimes[device.id] && (
                              <div className="mt-2 space-y-1">
                                <p className="text-sm text-gray-700">
                                  <span className="font-medium">Current device time:</span>{' '}
                                  {new Date(deviceTimes[device.id].device_time).toLocaleString()}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Timezone offset: UTC{deviceTimezones[device.id] >= 0 ? '+' : ''}{deviceTimezones[device.id] || '0'}
                                </p>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleRefreshDeviceTime(device.id)}
                            disabled={loadingDeviceTimes[device.id]}
                            className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Refresh device time"
                          >
                            <RefreshCw className={`w-5 h-5 ${loadingDeviceTimes[device.id] ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                        
                        {/* Timezone selector for this device */}
                        <div className="flex gap-3 items-end">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Set Timezone
                            </label>
                            <select
                              value={deviceTimezones[device.id] || '0'}
                              onChange={(e) => setDeviceTimezones(prev => ({
                                ...prev,
                                [device.id]: e.target.value
                              }))}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                              {timezones.map((tz) => (
                                <option key={tz.offset} value={tz.offset}>{tz.name}</option>
                              ))}
                            </select>
                          </div>
                          <button
                            onClick={() => handleSaveDeviceTimezone(device.id)}
                            disabled={saving || loadingDeviceTimes[device.id]}
                            className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center gap-2"
                          >
                            {saving ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Saving
                              </>
                            ) : (
                              <>
                                <Save className="w-4 h-4" />
                                Apply
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Info Message */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-gray-600 mt-0.5" />
                  <div className="text-sm text-gray-700">
                    <p className="font-medium mb-1">About Device Timezones</p>
                    <p>Each device's timezone is detected from its current time setting. You can configure each device individually or apply the same timezone to all devices at once using the bulk option above.</p>
                  </div>
                </div>
              </div>
          </div>
        )}

        {activeTab === 'sync' && (
          <div className="p-6 space-y-6">
            <div className="mb-2">
               <h2 className="text-lg font-semibold text-gray-900 mb-1">Sync Settings</h2>
               <p className="text-sm text-gray-600">Configure how employee data is synced from devices to the database.</p>
            </div>

             {/* Sync Confirmation Setting */}
             <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
               <div className="flex items-start justify-between">
                 <div className="flex-1">
                   <h3 className="text-md font-semibold text-gray-900 mb-2">Sync Confirmation</h3>
                   <p className="text-sm text-gray-600 mb-2">
                     Control how employee data is added to the database when syncing from devices.
                   </p>
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
                         <div className="font-medium text-gray-900">Confirm before adding data</div>
                         <div className="text-sm text-gray-600">
                           Show a preview of fetched employees and require confirmation before adding to database. 
                           <span className="text-primary-600 font-medium"> Recommended for data control.</span>
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
                         <div className="font-medium text-gray-900">Add automatically</div>
                         <div className="text-sm text-gray-600">
                           Sync and add employee data immediately without confirmation. Faster but less control.
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
                   <h3 className="text-md font-semibold text-gray-900 mb-2">Timestamp Validation</h3>
                   <p className="text-sm text-gray-600">
                     Automatically detect and correct malformed timestamps from devices (e.g., wrong date format, invalid years, day/month swaps).
                     <span className="text-yellow-600 font-medium"> Helps fix common device date/time issues.</span>
                   </p>
                 </div>
                 <div className="flex items-center gap-2 ml-4">
                   <label className="text-sm font-medium text-gray-700">Enabled</label>
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

             {/* Background Auto Sync Setting */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
               <h3 className="text-md font-semibold text-gray-900 mb-3">Background Auto Sync</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Auto Sync Every</p>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="number"
                      min={60}
                      step={60}
                      value={syncInterval}
                      onChange={(e) => setSyncInterval(Number(e.target.value))}
                      className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <span className="text-sm text-gray-600">seconds (min 60)</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Enabled</label>
                  <button
                    onClick={() => setSyncEnabled(prev => !prev)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${syncEnabled ? 'bg-primary-600' : 'bg-gray-300'}`}
                    aria-pressed={syncEnabled}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${syncEnabled ? 'translate-x-5' : 'translate-x-1'}`}
                    />
                  </button>
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                When enabled, the server syncs all devices automatically at the specified interval. Disable to rely only on manual sync from the Devices page.
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={saveGeneralSettings}
                disabled={loadingSync}
                className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50"
              >
                {loadingSync ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {loadingSync ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GeneralSettings;

