import { useState, useEffect } from 'react';
import { Plus, Trash2, Search, Loader, Edit } from 'lucide-react';
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
  });

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
          setFormData({ ip: '', port: '4370', tag: '', serial_number: '', name: '' });
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
          setFormData({ ip: '', port: '4370', tag: '', serial_number: '', name: '' });
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
                  setFormData({ ip: '', port: '4370', tag: '', serial_number: '', name: '' });
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
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {devices.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleEditDevice(device)}
                          className="text-primary-600 hover:text-primary-900 flex items-center gap-1"
                        >
                          <Edit className="w-4 h-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteDevice(device)}
                          className="text-red-600 hover:text-red-900 flex items-center gap-1"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
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
    </div>
  );
}
