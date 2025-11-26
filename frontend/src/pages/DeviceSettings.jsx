import { useState, useEffect } from 'react';
import { Plus, Trash2, Search, Loader, Edit, Users, FileText, Download, RefreshCw } from 'lucide-react';
import api from '../services/api';
import Dialog, { Toast } from '../components/Dialog';

export default function DeviceSettings() {
  const [devices, setDevices] = useState([]);
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
  const [syncingEmployees, setSyncingEmployees] = useState({});
  const [syncingLogs, setSyncingLogs] = useState({});
  const [showEmployeePreview, setShowEmployeePreview] = useState(false);
  const [employeePreviewData, setEmployeePreviewData] = useState(null);
  const [showLogsPreview, setShowLogsPreview] = useState(false);
  const [logsPreviewData, setLogsPreviewData] = useState(null);
  const [loadingStates, setLoadingStates] = useState({});

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const data = await api.getDevices();
      setDevices(data.devices || []);
    } catch (error) {
      alert('Failed to fetch devices: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleDiscovery = async () => {
    if (!formData.ip) {
      setDialog({
        isOpen: true,
        type: 'warning',
        title: 'Missing Information',
        message: 'Please enter an IP address to discover the device.',
        onConfirm: null
      });
      return;
    }

    setLoading(true);
    try {
      const data = await api.discoverDevice(formData.ip, formData.port || 4370);
      setDiscoveryData(data);
      
      // Auto-fill form with discovered data
      setFormData({
        ...formData,
        serial_number: data.serial_number || '',
        name: data.model || data.device_name || '',
      });
      
      setShowDiscovery(false);
      setShowAddForm(true);
      
      showToast('Device discovered successfully! Please review and save the device details.', 'success');
    } catch (error) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Discovery Failed',
        message: `Unable to discover device: ${error.message}`,
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
        title: 'Missing Information',
        message: 'IP address and port are required to add a device.',
        onConfirm: null
      });
      return;
    }

    setDialog({
      isOpen: true,
      type: 'confirm',
      title: 'Add Device',
      message: `Are you sure you want to add device "${formData.name || formData.ip}" to the system?`,
      confirmText: 'Add Device',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setDialog({ ...dialog, loading: true });
        try {
          await api.addDevice(formData);
          setDialog({ isOpen: false });
          showToast('Device added successfully!', 'success');
          setShowAddForm(false);
          setFormData({ ip: '', port: '4370', tag: '', serial_number: '', name: '', date_format: 'YYYY-MM-DD' });
          setDiscoveryData(null);
          fetchDevices();
        } catch (error) {
          setDialog({
            isOpen: true,
            type: 'error',
            title: 'Add Failed',
            message: `Failed to add device: ${error.message}`,
            onConfirm: null
          });
        }
      }
    });
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
        title: 'Missing Information',
        message: 'Device name is required to update the device.',
        onConfirm: null
      });
      return;
    }

    setDialog({
      isOpen: true,
      type: 'confirm',
      title: 'Update Device',
      message: `Are you sure you want to update device "${editingDevice.name}" with the new information?`,
      confirmText: 'Update Device',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setDialog({ ...dialog, loading: true });
        try {
          await api.updateDevice(editingDevice.id, formData);
          setDialog({ isOpen: false });
          showToast('Device updated successfully!', 'success');
          setShowAddForm(false);
          setEditingDevice(null);
          setFormData({ ip: '', port: '4370', tag: '', serial_number: '', name: '', date_format: 'YYYY-MM-DD' });
          fetchDevices();
        } catch (error) {
          setDialog({
            isOpen: true,
            type: 'error',
            title: 'Update Failed',
            message: `Failed to update device: ${error.message}`,
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
      title: 'Delete Device',
      message: `Are you sure you want to delete device "${device.name}"? This action cannot be undone and will remove all associated data.`,
      confirmText: 'Delete Device',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setDialog({ ...dialog, loading: true });
        try {
          await api.deleteDevice(device.id);
          setDialog({ isOpen: false });
          showToast('Device deleted successfully!', 'success');
          fetchDevices();
        } catch (error) {
          setDialog({
            isOpen: true,
            type: 'error',
            title: 'Delete Failed',
            message: `Failed to delete device: ${error.message}`,
            onConfirm: null
          });
        }
      }
    });
  };

  const handleFetchEmployeesPreview = async (device) => {
    const key = `${device.id}-employees`;
    setLoadingStates(prev => ({ ...prev, [key]: true }));
    try {
      // Check global setting for confirmation requirement
      const settings = await api.getGeneralSettings();
      
      if (settings.require_sync_confirmation) {
        // Fetch preview data only
        const result = await api.syncEmployeesFromDevice(device.id, true);
        setEmployeePreviewData({ device, result, requiresConfirmation: true });
        setShowEmployeePreview(true);
      } else {
        // Execute sync directly without confirmation
        const result = await api.syncEmployeesFromDevice(device.id, false);
        setEmployeePreviewData({ device, result, requiresConfirmation: false });
        setShowEmployeePreview(true);
        
        if (result.added > 0 || result.updated > 0) {
          showToast(`Synced ${result.total_fetched} employees from ${device.name}`, 'success');
        } else {
          showToast(`All employees already synced from ${device.name}`, 'info');
        }
      }
    } catch (error) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Fetch Failed',
        message: `Failed to fetch employees: ${error.message}`,
        onConfirm: null
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleConfirmEmployeeSync = async () => {
    if (!employeePreviewData) return;
    
    const key = `${employeePreviewData.device.id}-employees-confirm`;
    setLoadingStates(prev => ({ ...prev, [key]: true }));
    
    try {
      const result = await api.confirmEmployeeSync(employeePreviewData.device.id);
      
      // Update preview data to show completion
      setEmployeePreviewData({ 
        device: employeePreviewData.device, 
        result, 
        requiresConfirmation: false 
      });
      
      if (result.added > 0 || result.updated > 0) {
        showToast(`Successfully synced ${result.total_fetched} employees`, 'success');
      } else {
        showToast(`All employees already synced`, 'info');
      }
    } catch (error) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Sync Failed',
        message: `Failed to confirm sync: ${error.message}`,
        onConfirm: null
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleOpenLogsModal = (device) => {
    setSelectedDeviceForLogs(device);
    setShowLogsModal(true);
  };

  const handleFetchLogsPreview = async (days) => {
    if (!selectedDeviceForLogs) return;
    
    const key = `${selectedDeviceForLogs.id}-logs`;
    setLoadingStates(prev => ({ ...prev, [key]: true }));
    setShowLogsModal(false);
    
    try {
      // Check global setting for confirmation requirement
      const settings = await api.getGeneralSettings();
      
      if (settings.require_sync_confirmation) {
        // Fetch preview data only
        const result = await api.syncAttendanceFromDevice(selectedDeviceForLogs.id, days, true);
        setLogsPreviewData({ device: selectedDeviceForLogs, result, days, requiresConfirmation: true });
        setShowLogsPreview(true);
        setSelectedDeviceForLogs(null);
      } else {
        // Execute sync directly without confirmation
        const result = await api.syncAttendanceFromDevice(selectedDeviceForLogs.id, days, false);
        setLogsPreviewData({ device: selectedDeviceForLogs, result, days, requiresConfirmation: false });
        setShowLogsPreview(true);
        setSelectedDeviceForLogs(null);
        
        if (result.added > 0) {
          showToast(`Synced ${result.total_fetched} attendance records`, 'success');
        } else {
          showToast(`All logs already synced`, 'info');
        }
      }
    } catch (error) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Fetch Failed',
        message: `Failed to fetch attendance logs: ${error.message}`,
        onConfirm: null
      });
      setSelectedDeviceForLogs(null);
    } finally {
      setLoadingStates(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleConfirmAttendanceSync = async () => {
    if (!logsPreviewData) return;
    
    const key = `${logsPreviewData.device.id}-logs-confirm`;
    setLoadingStates(prev => ({ ...prev, [key]: true }));
    
    try {
      const result = await api.confirmAttendanceSync(logsPreviewData.device.id, logsPreviewData.days);
      
      // Update preview data to show completion
      setLogsPreviewData({ 
        device: logsPreviewData.device, 
        result, 
        days: logsPreviewData.days,
        requiresConfirmation: false 
      });
      
      if (result.added > 0) {
        showToast(`Successfully synced ${result.added} attendance records`, 'success');
      } else {
        showToast(`All logs already synced`, 'info');
      }
    } catch (error) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Sync Failed',
        message: `Failed to confirm sync: ${error.message}`,
        onConfirm: null
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Device Settings</h1>
        <div className="flex gap-3">
          <button
            onClick={() => setShowDiscovery(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <Search className="w-5 h-5" />
            Discover Device
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Device
          </button>
        </div>
      </div>

      {/* Discovery Modal */}
      {showDiscovery && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-6 text-gray-900">Discover Device</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Device IP Address *
                </label>
                <input
                  type="text"
                  placeholder="e.g., 10.185.1.201"
                  value={formData.ip}
                  onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Port
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
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    Discover
                  </>
                )}
              </button>
              <button
                onClick={() => setShowDiscovery(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Device Form */}
      {showAddForm && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6 text-gray-900">
            {editingDevice ? 'Edit Device' : discoveryData ? 'Add Discovered Device' : 'Add New Device'}
          </h2>
          
          {discoveryData && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="font-semibold text-green-800 mb-2">Device Discovered!</h3>
              <div className="text-sm text-green-700 space-y-1">
                <p><strong>Serial:</strong> {discoveryData.serial_number}</p>
                <p><strong>Model:</strong> {discoveryData.model}</p>
                <p><strong>Firmware:</strong> {discoveryData.firmware_version}</p>
                <p><strong>Platform:</strong> {discoveryData.platform}</p>
              </div>
            </div>
          )}

          <form onSubmit={editingDevice ? handleUpdateDevice : handleAddDevice} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Device Name *
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
                  Tag
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
                  IP Address *
                </label>
                <input
                  type="text"
                  placeholder="10.185.1.201"
                  value={formData.ip}
                  onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Port *
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
                  Serial Number (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Auto-filled from discovery"
                  value={formData.serial_number}
                  onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date Format *
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
                <p className="text-xs text-gray-500 mt-1">
                  Select the date format used by this device. This affects how attendance timestamps are parsed.
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:bg-gray-400"
              >
                {loading ? (editingDevice ? 'Updating...' : 'Adding...') : (editingDevice ? 'Update Device' : 'Add Device')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setEditingDevice(null);
                  setDiscoveryData(null);
                  setFormData({ ip: '', port: '4370', tag: '', serial_number: '', name: '', date_format: 'YYYY-MM-DD' });
                }}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Devices List */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Registered Devices</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Device Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  IP:Port
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tag
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Serial Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date Format
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {devices.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                    No devices registered. Click "Add Device" or "Discover Device" to get started.
                  </td>
                </tr>
              ) : (
                devices.map((device) => (
                  <tr key={device.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{device.name}</div>
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => handleFetchEmployeesPreview(device)}
                          disabled={loadingStates[`${device.id}-employees`]}
                          className="text-blue-600 hover:text-blue-900 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Sync employees from device to database"
                        >
                          {loadingStates[`${device.id}-employees`] ? (
                            <Loader className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4" />
                              <Users className="w-4 h-4" />
                            </>
                          )}
                          <span className="hidden lg:inline">Sync Users</span>
                        </button>
                        <button
                          onClick={() => handleOpenLogsModal(device)}
                          disabled={loadingStates[`${device.id}-logs`]}
                          className="text-green-600 hover:text-green-900 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Sync attendance logs from device to database"
                        >
                          {loadingStates[`${device.id}-logs`] ? (
                            <Loader className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4" />
                              <FileText className="w-4 h-4" />
                            </>
                          )}
                          <span className="hidden lg:inline">Sync Logs</span>
                        </button>
                        <button
                          onClick={() => handleEditDevice(device)}
                          className="text-primary-600 hover:text-primary-900 flex items-center gap-1"
                          title="Edit device"
                        >
                          <Edit className="w-4 h-4" />
                          <span className="hidden lg:inline">Edit</span>
                        </button>
                        <button
                          onClick={() => handleDeleteDevice(device)}
                          className="text-red-600 hover:text-red-900 flex items-center gap-1"
                          title="Delete device"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="hidden lg:inline">Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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

      {/* Logs Sync Modal */}
      {showLogsModal && selectedDeviceForLogs && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Sync Attendance Logs</h2>
            <p className="text-gray-600 mb-6">
              Choose how you want to sync attendance logs from <strong>{selectedDeviceForLogs.name}</strong>:
            </p>
            
            <div className="space-y-4">
              <button
                onClick={() => handleFetchLogsPreview(30)}
                disabled={loadingStates[`${selectedDeviceForLogs.id}-logs`]}
                className="w-full px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-left disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  {loadingStates[`${selectedDeviceForLogs.id}-logs`] ? (
                    <Loader className="w-5 h-5 animate-spin" />
                  ) : (
                    <Download className="w-5 h-5" />
                  )}
                  <div>
                    <div className="font-semibold">Recent Logs (Last 30 Days)</div>
                    <div className="text-sm text-blue-100">Fast sync - recommended for regular updates</div>
                  </div>
                </div>
              </button>
              
              <button
                onClick={() => handleFetchLogsPreview(0)}
                disabled={loadingStates[`${selectedDeviceForLogs.id}-logs`]}
                className="w-full px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-left disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  {loadingStates[`${selectedDeviceForLogs.id}-logs`] ? (
                    <Loader className="w-5 h-5 animate-spin" />
                  ) : (
                    <Download className="w-5 h-5" />
                  )}
                  <div>
                    <div className="font-semibold">All Logs</div>
                    <div className="text-sm text-green-100">Complete sync - may take longer</div>
                  </div>
                </div>
              </button>
            </div>
            
            <div className="mt-6">
              <button
                onClick={() => {
                  setShowLogsModal(false);
                  setSelectedDeviceForLogs(null);
                }}
                disabled={loadingStates[`${selectedDeviceForLogs.id}-logs`]}
                className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employee Preview Modal */}
      {showEmployeePreview && employeePreviewData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className={`bg-gradient-to-r ${employeePreviewData.requiresConfirmation ? 'from-yellow-600 to-yellow-700' : 'from-blue-600 to-blue-700'} text-white p-6`}>
              <h2 className="text-2xl font-bold mb-2">
                {employeePreviewData.requiresConfirmation ? 'Confirm Employee Sync' : 'Employee Sync Summary'}
              </h2>
              <p className={employeePreviewData.requiresConfirmation ? 'text-yellow-100' : 'text-blue-100'}>
                Device: {employeePreviewData.device.name}
              </p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-4 p-6 bg-gray-50 border-b">
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-3xl font-bold text-blue-600">{employeePreviewData.result.total_fetched || 0}</div>
                <div className="text-sm text-gray-600 mt-1">Total Fetched</div>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-3xl font-bold text-green-600">
                  {employeePreviewData.result.preview_data 
                    ? employeePreviewData.result.preview_data.filter(u => u.status === 'new').length 
                    : employeePreviewData.result.added}
                </div>
                <div className="text-sm text-gray-600 mt-1">New Employees</div>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-3xl font-bold text-yellow-600">
                  {employeePreviewData.result.preview_data 
                    ? employeePreviewData.result.preview_data.filter(u => u.status === 'update').length 
                    : employeePreviewData.result.updated}
                </div>
                <div className="text-sm text-gray-600 mt-1">Updated</div>
              </div>
            </div>

            {/* Content - Preview Data Table or Summary */}
            <div className="p-6 flex-1 overflow-y-auto">
              {employeePreviewData.requiresConfirmation && employeePreviewData.result.preview_data ? (
                <div className="space-y-4">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <h3 className="font-semibold text-yellow-900 mb-1">Review Changes Before Syncing</h3>
                    <p className="text-sm text-yellow-700">
                      Please review the employee data below before confirming the sync operation.
                    </p>
                  </div>
                  
                  {/* Preview Data Table */}
                  <div className="border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">User ID</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">UID</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Name</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Device Role</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">App Role</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {employeePreviewData.result.preview_data.map((user, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                                  user.status === 'new' 
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-yellow-100 text-yellow-700'
                                }`}>
                                  {user.status === 'new' ? 'New' : 'Update'}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono text-gray-900">{user.user_id}</td>
                              <td className="px-4 py-3 font-mono text-gray-600">{user.uid}</td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900">{user.name}</div>
                                {user.existing_name && user.existing_name !== user.name && (
                                  <div className="text-xs text-gray-500">Was: {user.existing_name}</div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                                  user.privilege === 14 || user.privilege === 6
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {user.privilege === 14 || user.privilege === 6 ? 'Admin' : 'User'} ({user.privilege})
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                                  user.app_privilege === 14
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {user.app_privilege === 14 ? 'Admin' : 'User'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Sync completed or no confirmation required */}
                  {(employeePreviewData.result.added === 0 && employeePreviewData.result.updated === 0) ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                      <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Users className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-blue-900 mb-1">All Employees Already Synced</h3>
                        <p className="text-sm text-blue-700">
                          All {employeePreviewData.result.total_fetched} employees from this device are already in your database.
                          No changes were made.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                      <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <Users className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-green-900 mb-1">Sync Completed Successfully</h3>
                        <p className="text-sm text-green-700">
                          {employeePreviewData.result.added > 0 && `Added ${employeePreviewData.result.added} new employee${employeePreviewData.result.added > 1 ? 's' : ''}. `}
                          {employeePreviewData.result.updated > 0 && `Updated ${employeePreviewData.result.updated} existing employee${employeePreviewData.result.updated > 1 ? 's' : ''}.`}
                        </p>
                      </div>
                    </div>
                  )}

                  {employeePreviewData.result.errors && employeePreviewData.result.errors.length > 0 && (
                    <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                      <h3 className="font-semibold text-red-900 mb-2">Errors ({employeePreviewData.result.errors.length})</h3>
                      <div className="text-sm text-red-700 space-y-1 max-h-32 overflow-y-auto">
                        {employeePreviewData.result.errors.slice(0, 5).map((err, idx) => (
                          <div key={idx}>• {err.name || `User ${err.user_id}`}: {err.error}</div>
                        ))}
                        {employeePreviewData.result.errors.length > 5 && (
                          <div className="text-red-600 font-medium">... and {employeePreviewData.result.errors.length - 5} more</div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="border-t p-6 bg-gray-50 flex justify-end gap-3">
              {employeePreviewData.requiresConfirmation ? (
                <>
                  <button
                    onClick={() => {
                      setShowEmployeePreview(false);
                      setEmployeePreviewData(null);
                    }}
                    className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmEmployeeSync}
                    disabled={loadingStates[`${employeePreviewData.device.id}-employees-confirm`]}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 flex items-center gap-2"
                  >
                    {loadingStates[`${employeePreviewData.device.id}-employees-confirm`] ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Confirming...
                      </>
                    ) : (
                      'Confirm & Sync'
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setShowEmployeePreview(false);
                    setEmployeePreviewData(null);
                  }}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Attendance Logs Preview Modal */}
      {showLogsPreview && logsPreviewData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className={`bg-gradient-to-r ${logsPreviewData.requiresConfirmation ? 'from-yellow-600 to-yellow-700' : 'from-green-600 to-green-700'} text-white p-6`}>
              <h2 className="text-2xl font-bold mb-2">
                {logsPreviewData.requiresConfirmation ? 'Confirm Attendance Sync' : 'Attendance Logs Sync Summary'}
              </h2>
              <p className={logsPreviewData.requiresConfirmation ? 'text-yellow-100' : 'text-green-100'}>
                Device: {logsPreviewData.device.name}
              </p>
              <p className={`${logsPreviewData.requiresConfirmation ? 'text-yellow-100' : 'text-green-100'} text-sm`}>
                Range: {logsPreviewData.days > 0 ? `Last ${logsPreviewData.days} days` : 'All logs'}
              </p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-5 gap-4 p-6 bg-gray-50 border-b">
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-3xl font-bold text-blue-600">
                  {logsPreviewData.result.total_fetched || 0}
                </div>
                <div className="text-sm text-gray-600 mt-1">Total Fetched</div>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-3xl font-bold text-green-600">
                  {logsPreviewData.result.preview_data 
                    ? logsPreviewData.result.new_count 
                    : logsPreviewData.result.added}
                </div>
                <div className="text-sm text-gray-600 mt-1">New Records</div>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-3xl font-bold text-gray-600">
                  {logsPreviewData.result.preview_data 
                    ? logsPreviewData.result.duplicate_count 
                    : logsPreviewData.result.skipped}
                </div>
                <div className="text-sm text-gray-600 mt-1">Duplicates</div>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-3xl font-bold text-orange-600">
                  {logsPreviewData.result.filtered_count || 0}
                </div>
                <div className="text-sm text-gray-600 mt-1">Filtered (Old)</div>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-3xl font-bold text-red-600">
                  {logsPreviewData.result.preview_data 
                    ? logsPreviewData.result.error_count 
                    : (logsPreviewData.result.errors?.length || 0)}
                </div>
                <div className="text-sm text-gray-600 mt-1">Errors</div>
              </div>
            </div>

            {/* Content - Preview Data Table or Summary */}
            <div className="p-6 flex-1 overflow-y-auto">
              {logsPreviewData.requiresConfirmation && logsPreviewData.result.preview_data ? (
                <div className="space-y-4">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <h3 className="font-semibold text-yellow-900 mb-1">Review Attendance Records Before Syncing</h3>
                    <p className="text-sm text-yellow-700">
                      Please review the attendance records below before confirming the sync operation.
                      {logsPreviewData.result.new_count > 0 && ` ${logsPreviewData.result.new_count} new record${logsPreviewData.result.new_count > 1 ? 's' : ''} will be added.`}
                    </p>
                  </div>
                  
                  {/* Preview Data Table */}
                  <div className="border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">User ID</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Employee</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Timestamp</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700">Type</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {logsPreviewData.result.preview_data.map((record, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                                  record.error
                                    ? 'bg-red-100 text-red-700'
                                    : record.exists 
                                      ? 'bg-gray-100 text-gray-700' 
                                      : 'bg-green-100 text-green-700'
                                }`}>
                                  {record.error ? 'Error' : record.exists ? 'Duplicate' : 'New'}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono text-gray-900">{record.user_id}</td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900">
                                  {record.employee_name || 'Unknown'}
                                </div>
                                {record.error && (
                                  <div className="text-xs text-red-600">{record.error}</div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-gray-600">
                                {new Date(record.timestamp).toLocaleString()}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                                  record.punch === 0 
                                    ? 'bg-blue-100 text-blue-700' 
                                    : record.punch === 1 
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {record.punch === 0 ? 'Check In' : record.punch === 1 ? 'Check Out' : `Type ${record.punch}`}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Sync completed or no confirmation required */}
                  {logsPreviewData.result.added === 0 && (!logsPreviewData.result.errors || logsPreviewData.result.errors.length === 0) ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                      <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-blue-900 mb-1">All Logs Already Synced</h3>
                        <p className="text-sm text-blue-700">
                          All {logsPreviewData.result.total_fetched} attendance records from this period are already in your database.
                          {logsPreviewData.result.skipped > 0 && ` ${logsPreviewData.result.skipped} duplicate record${logsPreviewData.result.skipped > 1 ? 's' : ''} were skipped.`}
                        </p>
                      </div>
                    </div>
                  ) : logsPreviewData.result.added > 0 ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                      <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <FileText className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-green-900 mb-1">Sync Completed Successfully</h3>
                        <p className="text-sm text-green-700">
                          Added {logsPreviewData.result.added} new attendance record{logsPreviewData.result.added > 1 ? 's' : ''} to the database.
                          {logsPreviewData.result.skipped > 0 && ` Skipped ${logsPreviewData.result.skipped} duplicate${logsPreviewData.result.skipped > 1 ? 's' : ''}.`}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {logsPreviewData.result.errors && logsPreviewData.result.errors.length > 0 && (
                    <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                      <h3 className="font-semibold text-red-900 mb-2">Errors ({logsPreviewData.result.errors.length})</h3>
                      <div className="text-sm text-red-700 space-y-1 max-h-32 overflow-y-auto">
                        {logsPreviewData.result.errors.slice(0, 5).map((err, idx) => (
                          <div key={idx}>• User {err.user_id} at {err.timestamp}: {err.error}</div>
                        ))}
                        {logsPreviewData.result.errors.length > 5 && (
                          <div className="text-red-600 font-medium">... and {logsPreviewData.result.errors.length - 5} more</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Recommendations */}
                  {logsPreviewData.result.added > 0 && (
                    <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <h3 className="font-semibold text-yellow-900 mb-2">💡 Next Steps</h3>
                      <ul className="text-sm text-yellow-700 space-y-1">
                        <li>• Visit the Attendance page to view the new records</li>
                        <li>• Check the Reports section for attendance analysis</li>
                        <li>• Set up automatic sync to keep data up to date</li>
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="border-t p-6 bg-gray-50 flex justify-end gap-3">
              {logsPreviewData.requiresConfirmation ? (
                <>
                  <button
                    onClick={() => {
                      setShowLogsPreview(false);
                      setLogsPreviewData(null);
                    }}
                    className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmAttendanceSync}
                    disabled={loadingStates[`${logsPreviewData.device.id}-logs-confirm`]}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 flex items-center gap-2"
                  >
                    {loadingStates[`${logsPreviewData.device.id}-logs-confirm`] ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Confirming...
                      </>
                    ) : (
                      'Confirm & Sync'
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setShowLogsPreview(false);
                    setLogsPreviewData(null);
                  }}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
