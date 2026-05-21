import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Search, Loader, Edit, Users, FileText, Download, RefreshCw, MonitorSmartphone, Database, X, Calendar, CalendarDays, Clock, ArrowRight, Save, Upload, RotateCcw, ShieldCheck, AlertTriangle, MoreVertical } from 'lucide-react';
import api from '../services/api';
import Dialog, { Toast } from '../components/Dialog';
import SyncOverlay from '../components/SyncOverlay';

// Read permissions from localStorage (set by App.jsx on login)
const canManageDevices = () => {
  try { return JSON.parse(localStorage.getItem('_userPerms') || '[]').includes('devices.manage'); }
  catch { return false; }
};

const canManageSettings = () => {
  try { return JSON.parse(localStorage.getItem('_userPerms') || '[]').includes('settings.manage'); }
  catch { return false; }
};

export default function DeviceSettings() {
  const { t } = useTranslation();
  const [devices, setDevices] = useState([]);
  const [deviceStatus, setDeviceStatus] = useState({});  // id → { is_online, last_seen_at }
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [discoveryData, setDiscoveryData] = useState(null);
  const [editingDevice, setEditingDevice] = useState(null);
  const [dialog, setDialog] = useState({ isOpen: false, type: '', title: '', message: '', onConfirm: null });
  const [toast, setToast] = useState(null);
  const [formData, setFormData] = useState({
    ip: '',
    port: '4370',
    tag: '',
    serial_number: '',
    name: '',
    date_format: 'YYYY-MM-DD',
  });
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedDeviceForLogs, setSelectedDeviceForLogs] = useState(null);
  const [logsSyncRange, setLogsSyncRange] = useState('month'); // today|yesterday|week|month|all|specific
  const [logsCustomFrom, setLogsCustomFrom] = useState('');
  const [logsCustomTo, setLogsCustomTo] = useState('');
  const [syncingEmployees, setSyncingEmployees] = useState({});
  const [syncingLogs, setSyncingLogs] = useState({});
  const [showEmployeePreview, setShowEmployeePreview] = useState(false);
  const [employeePreviewData, setEmployeePreviewData] = useState(null);
  const [showLogsPreview, setShowLogsPreview] = useState(false);
  const [logsPreviewData, setLogsPreviewData] = useState(null);
  const [loadingStates, setLoadingStates] = useState({});
  // New state: show confirmation panel after discovering device info on add
  const [pendingAddDevice, setPendingAddDevice] = useState(null); // { formData, discoveryInfo }
  const [addingDevice, setAddingDevice] = useState(null);  // null | 'sync' | 'add'
  // Backup / Restore
  const [backingUp, setBackingUp] = useState({});   // { [deviceId]: bool }
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreDevice, setRestoreDeviceState] = useState(null);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreOverwrite, setRestoreOverwrite] = useState(true);
  // ... action dropdown (fixed-position to escape overflow clipping)
  const [openMenu, setOpenMenu] = useState(null); // { id, top, left }
  const menuRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    };
    if (openMenu) document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [openMenu]);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);
  const [syncOverlay, setSyncOverlay] = useState({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });

  useEffect(() => {
    fetchDevices();
    fetchStatus();
    // Refresh status every 30s so the dot reflects recent heartbeats
    const t = setInterval(fetchStatus, 30 * 1000);
    return () => clearInterval(t);
  }, []);

  const fetchStatus = async () => {
    try {
      const data = await api.getDevicesStatus();
      const map = {};
      (data.devices || []).forEach(d => { map[d.id] = d; });
      setDeviceStatus(map);
    } catch (e) { /* ignore — devices still render */ }
  };

  const _fmtRelative = (iso) => {
    if (!iso) return '—';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60)      return `il y a ${Math.round(diff)} s`;
    if (diff < 3600)    return `il y a ${Math.round(diff / 60)} min`;
    if (diff < 86400)   return `il y a ${Math.round(diff / 3600)} h`;
    return new Date(iso).toLocaleString();
  };

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const data = await api.getDevices();
      setDevices(data.devices || []);
    } catch (error) {
      alert((t('failedToLoadData') || 'Failed to fetch devices') + ': ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleBackup = async (device) => {
    setSyncOverlay({ visible: true, phase: 'syncing', deviceName: device.name, direction: 'fromDevice' });
    try {
      const resp = await api.authFetch(`/api/devices/${device.id}/backup`, { method: 'GET' });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || (t('backupFailed') || 'Backup failed'));
      }
      const blob = await resp.blob();
      const cd = resp.headers.get('Content-Disposition') || '';
      const fnMatch = cd.match(/filename="([^"]+)"/);
      const filename = fnMatch ? fnMatch[1] : `backup_${device.name}.json`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setSyncOverlay({ visible: true, phase: 'done', deviceName: device.name, direction: 'fromDevice' });
      await new Promise(r => setTimeout(r, 1000));
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });
      showToast(t('backupSuccess') || 'Backup downloaded successfully', 'success');
    } catch (e) {
      setSyncOverlay({ visible: true, phase: 'error', deviceName: device.name, direction: 'fromDevice' });
      await new Promise(r => setTimeout(r, 1200));
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });
      showToast(e.message, 'error');
    }
  };

  const handleOpenRestore = (device) => {
    setRestoreDeviceState(device);
    setRestoreFile(null);
    setRestoreOverwrite(true);
    setRestoreResult(null);
    setShowRestoreModal(true);
  };

  const handleRestore = async () => {
    if (!restoreFile || !restoreDevice) return;
    setShowRestoreModal(false);
    setSyncOverlay({ visible: true, phase: 'syncing', deviceName: restoreDevice.name, direction: 'toDevice' });
    try {
      const text = await restoreFile.text();
      const resp = await api.authFetch(
        `/api/devices/${restoreDevice.id}/restore-backup?overwrite_existing=${restoreOverwrite}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: text,
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || (t('restoreFailed') || 'Restore failed'));
      setRestoreResult(data);
      setSyncOverlay({ visible: true, phase: 'done', deviceName: restoreDevice.name, direction: 'toDevice' });
      await new Promise(r => setTimeout(r, 1000));
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });
      showToast(
        (t('restoreSuccess') || 'Restore complete') +
        ` — ${data.restored} ${t('restored') || 'restored'}, ${data.fingerprints_restored} ${t('fingerprintsRestored') || 'fingerprints'}`,
        'success'
      );
    } catch (e) {
      setSyncOverlay({ visible: true, phase: 'error', deviceName: restoreDevice.name, direction: 'toDevice' });
      await new Promise(r => setTimeout(r, 1200));
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });
      showToast(e.message, 'error');
    }
  };

  const handleDiscovery = async () => {
    if (!formData.ip) {
      setDialog({
        isOpen: true,
        type: 'warning',
        title: t('missingInformation'),
        message: t('pleaseEnterIpToDiscover'),
        onConfirm: null
      });
      return;
    }

    setLoading(true);
    try {
      const data = await api.discoverDevice(formData.ip, formData.port || 4370);
      setDiscoveryData(data);
      
      // Auto-fill form with discovered data (including date format from device)
      setFormData({
        ...formData,
        serial_number: data.serial_number || '',
        name: data.model || data.device_name || '',
        date_format: data.date_format || 'YYYY-MM-DD',
      });
      
      setShowDiscovery(false);
      setShowAddForm(true);
      
      showToast(t('deviceDiscoveredDetails'), 'success');
    } catch (error) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: t('discoveryFailed'),
        message: `${t('discoveryFailed')}: ${error.message}`,
        onConfirm: null
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddDevice = async (e) => {
    e.preventDefault();
    
    if (!formData.ip || !formData.port) {
      setDialog({
        isOpen: true,
        type: 'warning',
        title: t('missingInformation'),
        message: t('ipAddress') + ' & ' + t('port') + ' ' + (t('required') || 'required') + '.',
        onConfirm: null
      });
      return;
    }

    // Step 1: Connect to device and fetch info (users, logs, serial, etc.)
    setLoading(true);
    try {
      const info = await api.discoverDevice(formData.ip, formData.port || 4370);
      
      // Auto-fill serial, name & date format if not already set
      const updatedForm = {
        ...formData,
        serial_number: formData.serial_number || info.serial_number || '',
        name: formData.name || info.device_name || '',
        date_format: info.date_format || formData.date_format || 'YYYY-MM-DD',
      };
      setFormData(updatedForm);
      
      // Step 2: Show confirmation panel with device info and action buttons
      setPendingAddDevice({ formData: updatedForm, discoveryInfo: info });
    } catch (error) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: t('error'),
        message: `${t('discoveryFailed')}: ${error.message}`,
        onConfirm: null
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAdd = async (syncData) => {
    if (!pendingAddDevice) return;
    const devName = pendingAddDevice.formData.name || pendingAddDevice.formData.ip;
    setSyncOverlay({ visible: true, phase: 'syncing', deviceName: devName, direction: syncData ? 'fromDevice' : 'toDevice' });
    try {
      await api.addDevice({ ...pendingAddDevice.formData, sync_data: syncData });
      setSyncOverlay({ visible: true, phase: 'done', deviceName: devName, direction: syncData ? 'fromDevice' : 'toDevice' });
      await new Promise(r => setTimeout(r, 1000));
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });
      showToast(
        syncData
          ? (t('deviceAddedSyncStarted') || 'Device added — sync started in background')
          : (t('deviceAdded') || 'Device added successfully'),
        'success'
      );
      setShowAddForm(false);
      setPendingAddDevice(null);
      setDiscoveryData(null);
      setFormData({ ip: '', port: '4370', tag: '', serial_number: '', name: '', date_format: 'YYYY-MM-DD' });
      fetchDevices();
    } catch (error) {
      setSyncOverlay({ visible: true, phase: 'error', deviceName: devName, direction: syncData ? 'fromDevice' : 'toDevice' });
      await new Promise(r => setTimeout(r, 1200));
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });
      setDialog({
        isOpen: true,
        type: 'error',
        title: t('error'),
        message: error.message,
        onConfirm: null
      });
    }
  };

  const handleEditDevice = (device) => {
    setEditingDevice(device);
    setFormData({
      ip: device.ip,
      port: device.port,
      tag: device.tag || '',
      serial_number: device.serial_number || '',
      name: device.name || '',
      date_format: device.date_format || 'YYYY-MM-DD',
    });
    setShowAddForm(true);
  };

  const handleUpdateDevice = async (e) => {
    e.preventDefault();
    
    if (!formData.name) {
      setDialog({
        isOpen: true,
        type: 'warning',
        title: t('missingInformation'),
        message: `${t('deviceName')} ${t('required') || 'required'}.`,
        onConfirm: null
      });
      return;
    }

      setDialog({
      isOpen: true,
      type: 'confirm',
        title: t('updateDevice'),
        message: `${t('updateDevice')}: "${editingDevice.name}"`,
        confirmText: t('updateDevice'),
        cancelText: t('cancel'),
      onConfirm: async () => {
        setDialog({ isOpen: false });
        setSyncOverlay({ visible: true, phase: 'syncing', deviceName: editingDevice.name, direction: 'toDevice' });
        try {
          await api.updateDevice(editingDevice.id, formData);
          setSyncOverlay({ visible: true, phase: 'done', deviceName: editingDevice.name, direction: 'toDevice' });
          await new Promise(r => setTimeout(r, 1000));
          setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });
          showToast(t('deviceUpdated'), 'success');
          setShowAddForm(false);
          setEditingDevice(null);
          setFormData({ ip: '', port: '4370', tag: '', serial_number: '', name: '', date_format: 'YYYY-MM-DD' });
          fetchDevices();
        } catch (error) {
          setSyncOverlay({ visible: true, phase: 'error', deviceName: editingDevice.name, direction: 'toDevice' });
          await new Promise(r => setTimeout(r, 1200));
          setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });
          setDialog({
            isOpen: true,
            type: 'error',
            title: t('error'),
            message: `${t('updateFailed')}: ${error.message}`,
            onConfirm: null
          });
        }
      }
    });
  };

  const handleDeleteDevice = (device) => {
    setDialog({
      isOpen: true,
      type: 'warning',
      title: t('deleteDeviceConfirmTitle'),
      message: t('deleteDeviceConfirmMsg'),
      confirmText: t('deleteDevice'),
      cancelText: t('cancel'),
      onConfirm: async () => {
        setDialog({ isOpen: false });
        setSyncOverlay({ visible: true, phase: 'syncing', deviceName: device.name, direction: 'toDevice' });
        try {
          await api.deleteDevice(device.id);
          setSyncOverlay({ visible: true, phase: 'done', deviceName: device.name, direction: 'toDevice' });
          await new Promise(r => setTimeout(r, 1000));
          setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });
          showToast(t('deviceDeleted'), 'success');
          fetchDevices();
        } catch (error) {
          setSyncOverlay({ visible: true, phase: 'error', deviceName: device.name, direction: 'toDevice' });
          await new Promise(r => setTimeout(r, 1200));
          setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });
          setDialog({
            isOpen: true,
            type: 'error',
            title: t('error'),
            message: `${t('deleteFailed')}: ${error.message}`,
            onConfirm: null
          });
        }
      }
    });
  };

  const handleFetchEmployeesPreview = async (device) => {
    setSyncOverlay({ visible: true, phase: 'syncing', deviceName: device.name, direction: 'fromDevice' });
    try {
      const result = await api.syncEmployeesFromDevice(device.id, true);
      setSyncOverlay({ visible: true, phase: 'done', deviceName: device.name, direction: 'fromDevice' });
      await new Promise(r => setTimeout(r, 800));
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });
      setEmployeePreviewData({ device, result });
      setShowEmployeePreview(true);
    } catch (error) {
      setSyncOverlay({ visible: true, phase: 'error', deviceName: device.name, direction: 'fromDevice' });
      await new Promise(r => setTimeout(r, 1200));
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });
      setDialog({
        isOpen: true,
        type: 'error',
        title: t('error'),
        message: `${t('failedToLoadData')}: ${error.message}`,
        onConfirm: null
      });
    }
  };

  const handleConfirmEmployeeSync = async () => {
    if (!employeePreviewData) return;
    const devName = employeePreviewData.device.name;
    setSyncOverlay({ visible: true, phase: 'syncing', deviceName: devName, direction: 'fromDevice' });
    
    try {
      const result = await api.confirmEmployeeSync(employeePreviewData.device.id);
      
      setSyncOverlay({ visible: true, phase: 'done', deviceName: devName, direction: 'fromDevice' });
      await new Promise(r => setTimeout(r, 1000));
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });

      setEmployeePreviewData({ 
        device: employeePreviewData.device, 
        result,
        syncDone: true
      });
      
      if (result.added > 0) {
        showToast(t('addedNewEmployees', { count: result.added }), 'success');
      } else {
        showToast(t('allEmployeesAlreadySynced'), 'info');
      }
    } catch (error) {
      setSyncOverlay({ visible: true, phase: 'error', deviceName: devName, direction: 'fromDevice' });
      await new Promise(r => setTimeout(r, 1200));
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });
      setDialog({
        isOpen: true,
        type: 'error',
        title: t('error'),
        message: `${t('updateFailed')}: ${error.message}`,
        onConfirm: null
      });
    }
  };

  const handleOpenLogsModal = (device) => {
    setSelectedDeviceForLogs(device);
    setLogsSyncRange('month');
    setLogsCustomFrom('');
    setLogsCustomTo('');
    setShowLogsModal(true);
  };

  // Compute days / start_date / end_date from the chosen preset
  const getDateRangeParams = (range, customFrom, customTo) => {
    const today = new Date();
    const fmt = (d) => d.toISOString().split('T')[0];
    switch (range) {
      case 'today':
        return { days: 1, startDate: fmt(today), endDate: fmt(today) };
      case 'yesterday': {
        const y = new Date(today); y.setDate(y.getDate() - 1);
        return { days: 2, startDate: fmt(y), endDate: fmt(y) };
      }
      case 'week':
        return { days: 7 };
      case 'month':
        return { days: 30 };
      case 'all':
        return { days: 0 };
      case 'specific':
        return { days: 0, startDate: customFrom || undefined, endDate: customTo || undefined };
      default:
        return { days: 30 };
    }
  };

  const handleFetchLogsPreview = async () => {
    if (!selectedDeviceForLogs) return;

    const devName = selectedDeviceForLogs.name;
    setShowLogsModal(false);
    setSyncOverlay({ visible: true, phase: 'syncing', deviceName: devName, direction: 'fromDevice' });

    const { days, startDate, endDate } = getDateRangeParams(logsSyncRange, logsCustomFrom, logsCustomTo);

    try {
      const result = await api.syncAttendanceFromDevice(selectedDeviceForLogs.id, days, true, { startDate, endDate });
      setSyncOverlay({ visible: true, phase: 'done', deviceName: devName, direction: 'fromDevice' });
      await new Promise(r => setTimeout(r, 800));
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });
      setLogsPreviewData({ device: selectedDeviceForLogs, result, days, startDate, endDate, requiresConfirmation: true });
      setShowLogsPreview(true);
      setSelectedDeviceForLogs(null);
    } catch (error) {
      setSyncOverlay({ visible: true, phase: 'error', deviceName: devName, direction: 'fromDevice' });
      await new Promise(r => setTimeout(r, 1200));
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });
      setDialog({
        isOpen: true,
        type: 'error',
        title: t('error'),
        message: `${t('failedToLoadData')}: ${error.message}`,
        onConfirm: null
      });
      setSelectedDeviceForLogs(null);
    }
  };

  const handleConfirmAttendanceSync = async () => {
    if (!logsPreviewData) return;
    const devName = logsPreviewData.device.name;
    setSyncOverlay({ visible: true, phase: 'syncing', deviceName: devName, direction: 'fromDevice' });
    
    try {
      const result = await api.confirmAttendanceSync(
        logsPreviewData.device.id, logsPreviewData.days,
        { startDate: logsPreviewData.startDate, endDate: logsPreviewData.endDate }
      );
      
      setSyncOverlay({ visible: true, phase: 'done', deviceName: devName, direction: 'fromDevice' });
      await new Promise(r => setTimeout(r, 1000));
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });

      setLogsPreviewData({ 
        device: logsPreviewData.device, 
        result, 
        days: logsPreviewData.days,
        startDate: logsPreviewData.startDate,
        endDate: logsPreviewData.endDate,
        requiresConfirmation: false 
      });
      
      if (result.added > 0) {
        showToast(t('syncSuccessRecords', { count: result.added }), 'success');
      } else {
        showToast(t('allLogsAlreadySynced'), 'info');
      }
    } catch (error) {
      setSyncOverlay({ visible: true, phase: 'error', deviceName: devName, direction: 'fromDevice' });
      await new Promise(r => setTimeout(r, 1200));
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });
      setDialog({
        isOpen: true,
        type: 'error',
        title: t('syncFailed'),
        message: `${t('failedToConfirmSync')}: ${error.message}`,
        onConfirm: null
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">{t('deviceSettings')}</h1>
        {canManageDevices() && (
          <div className="flex gap-3">
            <button
              onClick={() => setShowDiscovery(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <Search className="w-5 h-5" />
              {t('discoverDevice')}
            </button>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              {t('addDevice')}
            </button>
          </div>
        )}
      </div>

      {/* Discovery Modal */}
      {showDiscovery && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-6 text-gray-900">{t('discoverDevice')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('deviceIpAddress')} *
                </label>
                <input
                  type="text"
                  placeholder="ex. 192.168.1.100"
                  value={formData.ip}
                  onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('portLabel')}
                </label>
                <input
                  type="text"
                  placeholder="4370"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleDiscovery}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    {t('loading')}
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    {t('discover')}
                  </>
                )}
              </button>
              <button
                onClick={() => setShowDiscovery(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Device Form */}
      {showAddForm && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6 text-gray-900">
            {editingDevice ? t('editDevice') : discoveryData ? t('addDiscoveredDevice') : (t('addNewDevice') || 'Add New Device')}
          </h2>
          
          {discoveryData && !pendingAddDevice && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="font-semibold text-green-800 mb-2">{t('deviceDiscovered')}</h3>
              <div className="text-sm text-green-700 space-y-1">
                <p><strong>{t('serialNumber')}:</strong> {discoveryData.serial_number}</p>
                <p><strong>{t('modelLabel')}:</strong> {discoveryData.device_name}</p>
                <p><strong>{t('firmwareVersion')}:</strong> {discoveryData.firmware_version}</p>
                <p><strong>{t('platformLabel')}:</strong> {discoveryData.platform}</p>
                <p><strong>{t('users') || 'Users'}:</strong> {discoveryData.user_count ?? '—'}</p>
                <p><strong>{t('attendanceLogs') || 'Attendance Logs'}:</strong> {discoveryData.attendance_count ?? '—'}</p>
              </div>
            </div>
          )}

          {/* Device Info Confirmation Panel — shown after clicking "Add Device" */}
          {pendingAddDevice && (
            <div className="mb-6 rounded-lg border-2 border-blue-300 overflow-hidden">
              <div className="bg-blue-50 px-5 py-3 border-b border-blue-200">
                <h3 className="font-semibold text-blue-900 flex items-center gap-2">
                  <MonitorSmartphone className="w-5 h-5" />
                  {t('deviceInfo') || 'Device Information'}
                </h3>
              </div>
              <div className="p-5 bg-white">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">{t('serialNumber') || 'Serial Number'}</span>
                    <p className="font-semibold text-gray-900">{pendingAddDevice.discoveryInfo.serial_number || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('deviceName') || 'Device Name'}</span>
                    <p className="font-semibold text-gray-900">{pendingAddDevice.discoveryInfo.device_name || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('firmwareVersion')}</span>
                    <p className="font-semibold text-gray-900">{pendingAddDevice.discoveryInfo.firmware_version || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('platformLabel')}</span>
                    <p className="font-semibold text-gray-900">{pendingAddDevice.discoveryInfo.platform || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('macAddress')}</span>
                    <p className="font-semibold text-gray-900">{pendingAddDevice.discoveryInfo.mac_address || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('ipAddress') || 'IP'}</span>
                    <p className="font-semibold text-gray-900">{pendingAddDevice.discoveryInfo.ip_address || formData.ip}</p>
                  </div>
                </div>

                {/* Prominent user / attendance count */}
                <div className="flex gap-4 mt-5">
                  <div className="flex-1 rounded-lg bg-indigo-50 border border-indigo-200 p-4 text-center">
                    <Users className="w-6 h-6 text-indigo-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-indigo-700">{pendingAddDevice.discoveryInfo.user_count ?? 0}</p>
                    <p className="text-xs text-indigo-500 uppercase tracking-wide">{t('users') || 'Users'}</p>
                  </div>
                  <div className="flex-1 rounded-lg bg-amber-50 border border-amber-200 p-4 text-center">
                    <FileText className="w-6 h-6 text-amber-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-amber-700">{pendingAddDevice.discoveryInfo.attendance_count ?? 0}</p>
                    <p className="text-xs text-amber-500 uppercase tracking-wide">{t('attendanceLogs') || 'Attendance Logs'}</p>
                  </div>
                  <div className="flex-1 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-center">
                    <MonitorSmartphone className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-emerald-700">{pendingAddDevice.discoveryInfo.fingerprint_count ?? 0}</p>
                    <p className="text-xs text-emerald-500 uppercase tracking-wide">{t('fingerprints') || 'Fingerprints'}</p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-3 mt-6">
                  <button
                    onClick={() => handleConfirmAdd(true)}
                    disabled={!!addingDevice}
                    className="flex-1 px-5 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 flex items-center justify-center gap-2 font-medium"
                  >
                    {addingDevice === 'sync' ? <Loader className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
                    {t('addAndSyncData') || 'Add & Sync Data'}
                  </button>
                  <button
                    onClick={() => handleConfirmAdd(false)}
                    disabled={!!addingDevice}
                    className="flex-1 px-5 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:bg-gray-400 flex items-center justify-center gap-2 font-medium"
                  >
                    {addingDevice === 'add' ? <Loader className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    {t('addDeviceOnly') || 'Add Device Only'}
                  </button>
                  <button
                    onClick={() => setPendingAddDevice(null)}
                    disabled={!!addingDevice}
                    className="px-5 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={editingDevice ? handleUpdateDevice : handleAddDevice} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('deviceName')} *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Main Entrance"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('tag')}
                </label>
                <input
                  type="text"
                  placeholder="e.g., entrance, office"
                  value={formData.tag}
                  onChange={(e) => setFormData({ ...formData, tag: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('ipAddress')} *
                </label>
                <input
                  type="text"
                  placeholder="192.168.1.100"
                  value={formData.ip}
                  onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('port')} *
                </label>
                <input
                  type="text"
                  placeholder="4370"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('serialNumberOptional')}
                </label>
                <input
                  type="text"
                  placeholder={t('autoFilledFromDevice') || 'Auto-rempli depuis l\'appareil'}
                  value={formData.serial_number}
                  onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('dateFormat')} *
                </label>
                <select
                  value={formData.date_format}
                  onChange={(e) => setFormData({ ...formData, date_format: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="YYYY-MM-DD">YYYY-MM-DD (e.g., 2025-11-26)</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY (e.g., 26/11/2025)</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY (e.g., 11/26/2025)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">{t('dateFormatHelp')}</p>
              </div>
            </div>

            {!pendingAddDevice && (
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:bg-gray-400 flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      {t('connecting') || 'Connecting...'}
                    </>
                  ) : (
                    editingDevice ? t('updateDevice') : (t('addDevice'))
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingDevice(null);
                    setDiscoveryData(null);
                    setPendingAddDevice(null);
                    setFormData({ ip: '', port: '4370', tag: '', serial_number: '', name: '', date_format: 'YYYY-MM-DD' });
                  }}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t('cancel')}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Devices List */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="p-6 border-b border-gray-200 rounded-t-lg">
          <h2 className="text-xl font-semibold text-gray-800">{t('registeredDevices')}</h2>
        </div>
        <div className="overflow-x-auto overflow-y-visible">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('deviceName')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('ipPort')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('tag')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('serialNumber')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('dateFormat')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {devices.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                    {t('noDevicesRegistered')}
                  </td>
                </tr>
              ) : (
                devices.map((device) => {
                  const st = deviceStatus[device.id];
                  const online = !!st?.is_online;
                  const dotTitle = st
                    ? (online
                        ? `${t('online') || 'En ligne'} · ${t('lastSeen') || 'Vu'} ${_fmtRelative(st.last_seen_at)}`
                        : `${t('offline') || 'Hors ligne'} · ${t('lastSeen') || 'Vu'} ${_fmtRelative(st.last_seen_at)}`)
                    : (t('online') || 'Status inconnu');
                  return (
                  <tr key={device.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span
                          title={dotTitle}
                          className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${
                            online ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]'
                                   : 'bg-gray-300'
                          }`}
                        />
                        <div className="text-sm font-medium text-gray-900">{device.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {device.ip}:{device.port}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {device.tag && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                          {device.tag}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {device.serial_number || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="px-2 py-1 text-xs font-mono rounded bg-gray-100 text-gray-700">
                        {device.date_format || 'YYYY-MM-DD'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        {/* Sync Users — managers only (reporting users sync logs only) */}
                        {canManageDevices() && (
                        <button
                          onClick={() => handleFetchEmployeesPreview(device)}
                          disabled={loadingStates[`${device.id}-employees`]}
                          className="text-blue-600 hover:text-blue-900 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={t('syncUsers')}
                        >
                          {loadingStates[`${device.id}-employees`] ? (
                            <Loader className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4" />
                              <Users className="w-4 h-4" />
                            </>
                          )}
                          <span className="hidden lg:inline">{t('syncUsers')}</span>
                        </button>
                        )}
                        {/* Sync Logs — visible to anyone who can sync (incl. reporting users) */}
                        <button
                          onClick={() => handleOpenLogsModal(device)}
                          disabled={loadingStates[`${device.id}-logs`]}
                          className="text-green-600 hover:text-green-900 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={t('syncLogs')}
                        >
                          {loadingStates[`${device.id}-logs`] ? (
                            <Loader className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4" />
                              <FileText className="w-4 h-4" />
                            </>
                          )}
                          <span className="hidden lg:inline">{t('syncLogs')}</span>
                        </button>

                        {/* ··· more actions dropdown — managers only (edit/backup/restore/delete) */}
                        {canManageDevices() && (
                        <div>
                          <button
                            onClick={(e) => {
                              if (openMenu?.id === device.id) { setOpenMenu(null); return; }
                              const rect = e.currentTarget.getBoundingClientRect();
                              setOpenMenu({ id: device.id, top: rect.bottom + 4, left: rect.right - 176 });
                            }}
                            className="p-1.5 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                            title={t('moreActions') || 'Plus d\'actions'}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                        )}

                        {openMenu?.id === device.id && (
                          <div
                            ref={menuRef}
                            style={{ position: 'fixed', top: openMenu.top, left: openMenu.left, zIndex: 9999 }}
                            className="w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
                          >
                            {/* Edit — Super Admin only */}
                            {canManageDevices() && (
                            <button
                              onClick={() => { setOpenMenu(null); handleEditDevice(device); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Edit className="w-4 h-4 text-gray-500" />
                              {t('edit')}
                            </button>
                            )}
                            {/* Backup */}
                            {canManageDevices() && (
                            <button
                              onClick={() => { setOpenMenu(null); handleBackup(device); }}
                              disabled={backingUp[device.id]}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              {backingUp[device.id] ? (
                                <Loader className="w-4 h-4 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4" />
                              )}
                              {t('backup') || 'Backup'}
                            </button>
                            )}
                            {/* Restore */}
                            {canManageDevices() && (
                            <button
                              onClick={() => { setOpenMenu(null); handleOpenRestore(device); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50"
                            >
                              <RotateCcw className="w-4 h-4" />
                              {t('restore') || 'Restore'}
                            </button>
                            )}
                            {canManageDevices() && (
                            <>
                              <div className="border-t border-gray-100 my-1" />
                              {/* Delete — Super Admin only */}
                              <button
                                onClick={() => { setOpenMenu(null); handleDeleteDevice(device); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                                {t('delete')}
                              </button>
                            </>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sync Overlay */}
      <SyncOverlay visible={syncOverlay.visible} phase={syncOverlay.phase} deviceName={syncOverlay.deviceName} direction={syncOverlay.direction} />

      {/* Dialog Component */}
      <Dialog
        isOpen={dialog.isOpen}
        onClose={() => setDialog({ isOpen: false })}
        onConfirm={dialog.onConfirm}
        title={dialog.title}
        message={dialog.message}
        type={dialog.type}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        loading={dialog.loading}
      />

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Logs Sync Modal — date range selector */}
      {showLogsModal && selectedDeviceForLogs && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/60 max-w-md w-full overflow-hidden animate-[popIn_0.18s_ease-out]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center">
                  <Download className="w-[18px] h-[18px] text-primary-600" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900">{t('syncAttendanceLogs')}</h2>
                  <p className="text-xs font-mono text-slate-400">{selectedDeviceForLogs.name}</p>
                </div>
              </div>
              <button
                onClick={() => { setShowLogsModal(false); setSelectedDeviceForLogs(null); }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Preset grid */}
            <div className="px-6 pb-2">
              <label className="block text-xs font-medium text-slate-500 mb-2">{t('selectPeriod')}</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'today',     icon: Clock,        label: t('today') },
                  { key: 'yesterday', icon: CalendarDays, label: t('yesterday') },
                  { key: 'week',      icon: Calendar,     label: t('thisWeek') },
                  { key: 'month',     icon: Calendar,     label: t('thisMonth') },
                  { key: 'all',       icon: Database,     label: t('allLogs') },
                  { key: 'specific',  icon: CalendarDays, label: t('specificRange') },
                ].map(({ key, icon: Icon, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLogsSyncRange(key)}
                    className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-[13px] font-medium transition-all duration-150
                      ${logsSyncRange === key
                        ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-sm'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Custom date range — shown only when 'specific' */}
              {logsSyncRange === 'specific' && (
                <div className="mt-4 flex items-center gap-2 animate-[fadeIn_0.15s_ease-out]">
                  <div className="flex-1">
                    <label className="block text-xs text-slate-500 mb-1">{t('from')}</label>
                    <input
                      type="date"
                      value={logsCustomFrom}
                      onChange={e => setLogsCustomFrom(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none"
                    />
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 mt-5" />
                  <div className="flex-1">
                    <label className="block text-xs text-slate-500 mb-1">{t('to')}</label>
                    <input
                      type="date"
                      value={logsCustomTo}
                      onChange={e => setLogsCustomTo(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Reassurance: incremental, no duplicates */}
            <div className="px-6 pt-3 pb-1">
              <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>{t('logsIncrementalNote') || "Seuls les nouveaux pointages sont importés. Les pointages déjà enregistrés sont ignorés automatiquement — aucun doublon."}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 px-6 py-4">
              <button
                onClick={() => { setShowLogsModal(false); setSelectedDeviceForLogs(null); }}
                disabled={loadingStates[`${selectedDeviceForLogs.id}-logs`]}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleFetchLogsPreview}
                disabled={loadingStates[`${selectedDeviceForLogs.id}-logs`] || (logsSyncRange === 'specific' && !logsCustomFrom && !logsCustomTo)}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                {loadingStates[`${selectedDeviceForLogs.id}-logs`] ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {t('syncLogs')}
              </button>
            </div>
          </div>
          <style>{`
            @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
            @keyframes popIn { 0% { opacity: 0; transform: scale(0.96) } 70% { transform: scale(1.01) } 100% { opacity: 1; transform: scale(1) } }
          `}</style>
        </div>
      )}

      {/* Employee Preview Modal */}
      {showEmployeePreview && employeePreviewData && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col">
            {/* Header — compact */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${employeePreviewData.syncDone ? 'bg-green-500' : 'bg-blue-500'}`} />
                <h2 className="text-lg font-semibold text-gray-900">
                  {employeePreviewData.syncDone ? t('employeeSyncResult') : t('employeeSyncPreview')}
                </h2>
                <span className="text-sm text-gray-500">— {employeePreviewData.device.name}</span>
              </div>
              <button
                onClick={() => { setShowEmployeePreview(false); setEmployeePreviewData(null); }}
                className="text-gray-400 hover:text-gray-600:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Inline stats bar */}
            <div className="flex items-center gap-6 px-5 py-3 bg-gray-50 border-b text-sm">
              <span className="text-gray-600">
                {t('totalOnDevice')}: <strong className="text-gray-900">{employeePreviewData.result.total_fetched || 0}</strong>
              </span>
              <span className="text-green-600">
                {t('newEmployees')}: <strong>{employeePreviewData.syncDone ? (employeePreviewData.result.added || 0) : (employeePreviewData.result.new_count || 0)}</strong>
              </span>
              <span className="text-gray-500">
                {t('existingEmployees')}: <strong>{employeePreviewData.syncDone ? (employeePreviewData.result.skipped || 0) : (employeePreviewData.result.existing_count || 0)}</strong>
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {!employeePreviewData.syncDone && employeePreviewData.result.preview_data ? (
                <>
                  {(employeePreviewData.result.new_count || 0) === 0 && (
                    <div className="mx-5 mt-4 px-3 py-2 bg-gray-100 rounded text-sm text-gray-600">
                      {t('allEmployeesAlreadySynced')}
                    </div>
                  )}
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <th className="px-5 py-2.5">{t('status')}</th>
                        <th className="px-5 py-2.5">ID</th>
                        <th className="px-5 py-2.5">{t('name')}</th>
                        <th className="px-5 py-2.5">{t('deviceRole')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {[...employeePreviewData.result.preview_data]
                        .sort((a, b) => (a.status === 'new' ? 0 : 1) - (b.status === 'new' ? 0 : 1))
                        .map((user, idx) => (
                        <tr key={idx} className="hover:bg-gray-50:bg-gray-750">
                          <td className="px-5 py-2.5">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                              user.status === 'new'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              {user.status === 'new' ? t('statusNew') : t('statusExisting')}
                            </span>
                          </td>
                          <td className="px-5 py-2.5 font-mono text-gray-700">{user.user_id}</td>
                          <td className="px-5 py-2.5 text-gray-900">{user.name}</td>
                          <td className="px-5 py-2.5">
                            <span className={`text-xs ${user.privilege === 14 || user.privilege === 6 ? 'text-purple-600' : 'text-gray-500'}`}>
                              {user.privilege === 14 || user.privilege === 6 ? t('adminLabel') : t('userLabel')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : employeePreviewData.syncDone ? (
                <div className="p-5 space-y-3">
                  <div className={`flex items-center gap-2 text-sm ${(employeePreviewData.result.added || 0) > 0 ? 'text-green-700' : 'text-gray-600'}`}>
                    <div className={`w-2 h-2 rounded-full ${(employeePreviewData.result.added || 0) > 0 ? 'bg-green-500' : 'bg-gray-400'}`} />
                    {(employeePreviewData.result.added || 0) > 0
                      ? <span>{t('addedNewEmployees', { count: employeePreviewData.result.added })} · {t('skippedExisting', { count: employeePreviewData.result.skipped || 0 })}</span>
                      : <span>{t('allEmployeesAlreadySynced')}</span>
                    }
                  </div>
                  {employeePreviewData.result.errors?.length > 0 && (
                    <div className="text-sm text-red-600 space-y-0.5">
                      {employeePreviewData.result.errors.slice(0, 5).map((err, idx) => (
                        <div key={idx}>{err.name || `User ${err.user_id}`}: {err.error}</div>
                      ))}
                      {employeePreviewData.result.errors.length > 5 && <div>+{employeePreviewData.result.errors.length - 5} more</div>}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Footer — compact */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t">
              {!employeePreviewData.syncDone ? (
                <>
                  <button
                    onClick={() => { setShowEmployeePreview(false); setEmployeePreviewData(null); }}
                    className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100:bg-gray-700 rounded-lg transition-colors"
                  >
                    {t('cancel')}
                  </button>
                  {(employeePreviewData.result.new_count || 0) > 0 && (
                    <button
                      onClick={handleConfirmEmployeeSync}
                      disabled={loadingStates[`${employeePreviewData.device.id}-employees-confirm`]}
                      className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {loadingStates[`${employeePreviewData.device.id}-employees-confirm`] ? (
                        <><Loader className="w-3.5 h-3.5 animate-spin" /> {t('confirming')}</>
                      ) : (
                        <>{t('confirmAddNew')} ({employeePreviewData.result.new_count})</>
                      )}
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={() => { setShowEmployeePreview(false); setEmployeePreviewData(null); }}
                  className="px-4 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800:bg-gray-500 transition-colors"
                >
                  {t('close')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Attendance Logs Preview Modal */}
      {showLogsPreview && logsPreviewData && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col">
            {/* Header — compact */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${logsPreviewData.requiresConfirmation ? 'bg-yellow-500' : 'bg-green-500'}`} />
                <h2 className="text-lg font-semibold text-gray-900">
                  {logsPreviewData.requiresConfirmation ? t('confirmSync') || 'Confirm Attendance Sync' : t('syncCompleted') || 'Attendance Sync'}
                </h2>
                <span className="text-sm text-gray-500">— {logsPreviewData.device.name}</span>
              </div>
              <button
                onClick={() => { setShowLogsPreview(false); setLogsPreviewData(null); }}
                className="text-gray-400 hover:text-gray-600:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Inline stats bar */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 py-3 bg-gray-50 border-b text-sm">
              <span className="text-gray-600">
                {t('totalOnDevice')}: <strong className="text-gray-900">{logsPreviewData.result.total_fetched || 0}</strong>
              </span>
              <span className="text-green-600">
                {t('new') || 'New'}: <strong>{logsPreviewData.result.preview_data ? logsPreviewData.result.new_count : logsPreviewData.result.added}</strong>
              </span>
              <span className="text-gray-500">
                {t('duplicates') || 'Duplicates'}: <strong>{logsPreviewData.result.preview_data ? logsPreviewData.result.duplicate_count : logsPreviewData.result.skipped}</strong>
              </span>
              {(logsPreviewData.result.filtered_count || 0) > 0 && (
                <span className="text-orange-500">
                  {t('filteredOld')}: <strong>{logsPreviewData.result.filtered_count}</strong>
                </span>
              )}
              {((logsPreviewData.result.preview_data ? logsPreviewData.result.error_count : logsPreviewData.result.errors?.length) || 0) > 0 && (
                <span className="text-red-500">
                  {t('errorsLabel')}: <strong>{logsPreviewData.result.preview_data ? logsPreviewData.result.error_count : logsPreviewData.result.errors?.length}</strong>
                </span>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {logsPreviewData.requiresConfirmation && logsPreviewData.result.preview_data ? (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <th className="px-5 py-2.5">{t('status')}</th>
                      <th className="px-5 py-2.5">{t('userId') || 'ID Utilisateur'}</th>
                      <th className="px-5 py-2.5">{t('employee') || 'Employé'}</th>
                      <th className="px-5 py-2.5">{t('timestamp') || 'Horodatage'}</th>
                      <th className="px-5 py-2.5">{t('type') || 'Type'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {logsPreviewData.result.preview_data.map((record, idx) => (
                      <tr key={idx} className="hover:bg-gray-50:bg-gray-750">
                        <td className="px-5 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            record.error
                              ? 'bg-red-100 text-red-700'
                              : record.exists
                                ? 'bg-gray-100 text-gray-500'
                                : 'bg-green-100 text-green-700'
                          }`}>
                            {record.error ? t('error') || 'Error' : record.exists ? t('duplicate') || 'Duplicate' : t('statusNew')}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 font-mono text-gray-700">{record.user_id}</td>
                        <td className="px-5 py-2.5 text-gray-900">
                          {record.employee_name || '—'}
                          {record.error && <div className="text-xs text-red-500">{record.error}</div>}
                        </td>
                        <td className="px-5 py-2.5 text-gray-600 tabular-nums">
                          {new Date(record.timestamp).toLocaleString()}
                        </td>
                        <td className="px-5 py-2.5">
                          <span className={`text-xs ${record.punch === 0 ? 'text-blue-600' : record.punch === 1 ? 'text-green-600' : 'text-gray-500'}`}>
                            {record.punch === 0 ? t('punchIn') : record.punch === 1 ? t('punchOut') : `#${record.punch}`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-5 space-y-3">
                  {logsPreviewData.result.added > 0 ? (
                    <div className="flex items-center gap-2 text-sm text-green-700">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span>
                        {t('recordsAddedCount', { count: logsPreviewData.result.added })}
                        {logsPreviewData.result.skipped > 0 && ` · ${t('duplicatesSkipped', { count: logsPreviewData.result.skipped })}`}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <div className="w-2 h-2 rounded-full bg-gray-400" />
                      <span>{t('allLogsAlreadySynced') || 'All records already synced'}</span>
                    </div>
                  )}
                  {logsPreviewData.result.errors?.length > 0 && (
                    <div className="text-sm text-red-600 space-y-0.5">
                      {logsPreviewData.result.errors.slice(0, 5).map((err, idx) => (
                        <div key={idx}>User {err.user_id}: {err.error}</div>
                      ))}
                      {logsPreviewData.result.errors.length > 5 && <div>+{logsPreviewData.result.errors.length - 5} more</div>}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer — compact */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t">
              {logsPreviewData.requiresConfirmation ? (
                <>
                  <button
                    onClick={() => { setShowLogsPreview(false); setLogsPreviewData(null); }}
                    className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100:bg-gray-700 rounded-lg transition-colors"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    onClick={handleConfirmAttendanceSync}
                    disabled={loadingStates[`${logsPreviewData.device.id}-logs-confirm`]}
                    className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {loadingStates[`${logsPreviewData.device.id}-logs-confirm`] ? (
                      <><Loader className="w-3.5 h-3.5 animate-spin" /> {t('confirming') || 'Confirming...'}</>
                    ) : (
                      <>{t('confirmSync') || 'Confirm & Sync'}</>
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { setShowLogsPreview(false); setLogsPreviewData(null); }}
                  className="px-4 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800:bg-gray-500 transition-colors"
                >
                  {t('close')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Restore Modal ─────────────────────────────────────── */}
      {showRestoreModal && restoreDevice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-500" />
                {t('restoreDevice') || 'Restore Device'} — {restoreDevice.name}
              </h2>
              <button
                onClick={() => { setShowRestoreModal(false); setRestoreResult(null); }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {!restoreResult ? (
                <>
                  {/* Warning banner */}
                  <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <p>{t('restoreWarning') || 'This will write users and fingerprints back to the device. Existing users will be overwritten if the option below is enabled.'}</p>
                  </div>

                  {/* File picker */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('selectBackupFile') || 'Select backup file (.json)'}
                    </label>
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={e => setRestoreFile(e.target.files[0] || null)}
                      className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border file:border-gray-300 file:text-sm file:font-medium file:text-gray-700 file:bg-white hover:file:bg-gray-50 cursor-pointer"
                    />
                    {restoreFile && (
                      <p className="mt-1 text-xs text-gray-500">
                        {restoreFile.name} ({(restoreFile.size / 1024).toFixed(1)} KB)
                      </p>
                    )}
                  </div>

                  {/* Overwrite option */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={restoreOverwrite}
                      onChange={e => setRestoreOverwrite(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-amber-600"
                    />
                    <span className="text-sm text-gray-700">
                      {t('restoreOverwrite') || 'Overwrite existing users (recommended)'}
                    </span>
                  </label>

                  {/* Actions */}
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      onClick={() => { setShowRestoreModal(false); setRestoreResult(null); }}
                      className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      {t('cancel')}
                    </button>
                    <button
                      onClick={handleRestore}
                      disabled={restoring || !restoreFile}
                      className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
                    >
                      {restoring ? (
                        <Loader className="w-4 h-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-4 h-4" />
                      )}
                      {restoring ? (t('restoring') || 'Restoring...') : (t('startRestore') || 'Start Restore')}
                    </button>
                  </div>
                </>
              ) : (
                /* Results panel */
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-green-700">{restoreResult.restored}</p>
                      <p className="text-green-600">{t('usersRestored') || 'Users restored'}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-blue-700">{restoreResult.fingerprints_restored}</p>
                      <p className="text-blue-600">{t('fingerprintsRestored') || 'Fingerprints'}</p>
                    </div>
                    {restoreResult.skipped > 0 && (
                      <div className="bg-gray-50 border rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-gray-600">{restoreResult.skipped}</p>
                        <p className="text-gray-500">{t('skipped') || 'Skipped'}</p>
                      </div>
                    )}
                    {restoreResult.errors > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-red-600">{restoreResult.errors}</p>
                        <p className="text-red-500">{t('errorsLabel') || 'Errors'}</p>
                      </div>
                    )}
                  </div>

                  {/* Per-user detail */}
                  <div className="max-h-48 overflow-y-auto border rounded-lg divide-y text-sm">
                    {restoreResult.results.map((r, i) => (
                      <div key={i} className={`flex items-center gap-3 px-3 py-2 ${r.status === 'error' ? 'bg-red-50' : ''}`}>
                        {r.status === 'restored' ? (
                          <ShieldCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : r.status === 'skipped' ? (
                          <RotateCcw className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        )}
                        <span className="flex-1 truncate font-medium text-gray-900">{r.name}</span>
                        {r.status === 'restored' && r.fingerprints_restored > 0 && (
                          <span className="text-xs text-blue-600 whitespace-nowrap">
                            {r.fingerprints_restored} fp
                          </span>
                        )}
                        {r.error && <span className="text-xs text-red-600 truncate">{r.error}</span>}
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => { setShowRestoreModal(false); setRestoreResult(null); }}
                      className="px-5 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                    >
                      {t('close')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
