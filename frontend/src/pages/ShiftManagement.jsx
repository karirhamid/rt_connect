import { useState, useEffect } from 'react';
import { Clock, Plus, Edit2, Trash2, Save, X, Loader2, Calendar, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import Dialog, { Toast } from '../components/Dialog';

function ShiftManagement() {
  const { t } = useTranslation();
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [notification, setNotification] = useState(null);
  const [dialog, setDialog] = useState({ isOpen: false, type: '', title: '', message: '', onConfirm: null });
  const [toast, setToast] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    shift_type: 'regular',
    color: '#3B82F6',
    description: '',
    is_active: true
  });

  const shiftTypes = [
    { value: 'regular', label: t('regular'), color: '#3B82F6' },
    { value: 'night', label: t('night'), color: '#6366F1' },
    { value: 'weekend', label: t('weekend'), color: '#10B981' },
    { value: 'guard', label: t('guard'), color: '#F59E0B' },
    { value: 'holiday', label: t('holiday'), color: '#EF4444' },
    { value: 'aid', label: t('aid'), color: '#F59E0B' }
  ];

  useEffect(() => {
    loadShifts();
  }, []);

  const loadShifts = async () => {
    try {
      setLoading(true);
      const data = await api.getShifts();
      setShifts(data);
    } catch (error) {
      showNotification('error', 'Failed to load shifts: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleOpenModal = (shift = null) => {
    if (shift) {
      setEditingShift(shift);
      setFormData({
        name: shift.name,
        shift_type: shift.shift_type,
        color: shift.color,
        description: shift.description || '',
        is_active: shift.is_active
      });
    } else {
      setEditingShift(null);
      setFormData({
        name: '',
        shift_type: 'regular',
        color: '#3B82F6',
        description: '',
        is_active: true
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingShift(null);
    setFormData({
      name: '',
      shift_type: 'regular',
      color: '#3B82F6',
      description: '',
      is_active: true
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const action = editingShift ? 'update' : 'create';
    const actionText = editingShift ? 'Update' : 'Create';
    
    setDialog({
      isOpen: true,
      type: 'confirm',
      title: `${actionText} Shift`,
      message: `Are you sure you want to ${action} shift "${formData.name}"?`,
      confirmText: `${actionText} Shift`,
      cancelText: 'Cancel',
      onConfirm: async () => {
        setDialog({ ...dialog, loading: true });
        try {
          if (editingShift) {
            await api.updateShift(editingShift.id, formData);
            showToast('Shift updated successfully!', 'success');
          } else {
            await api.createShift(formData);
            showToast('Shift created successfully!', 'success');
          }
          
          setDialog({ isOpen: false });
          handleCloseModal();
          loadShifts();
        } catch (error) {
          setDialog({
            isOpen: true,
            type: 'error',
            title: 'Operation Failed',
            message: `Failed to ${action} shift: ${error.message}`,
            onConfirm: null
          });
        }
      }
    });
  };

  const handleDelete = (shift) => {
    setDialog({
      isOpen: true,
      type: 'warning',
      title: 'Delete Shift',
      message: `Are you sure you want to delete shift "${shift.name}"? This will remove all associated timings and employee assignments. This action cannot be undone.`,
      confirmText: 'Delete Shift',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setDialog({ ...dialog, loading: true });
        try {
          await api.deleteShift(shift.id);
          setDialog({ isOpen: false });
          showToast('Shift deleted successfully!', 'success');
          loadShifts();
        } catch (error) {
          setDialog({
            isOpen: true,
            type: 'error',
            title: 'Delete Failed',
            message: `Failed to delete shift: ${error.message}`,
            onConfirm: null
          });
        }
      }
    });
  };

  const getShiftTypeBadge = (type) => {
    const typeConfig = shiftTypes.find(t => t.value === type) || shiftTypes[0];
    return (
      <span 
        className="px-2 py-1 rounded-full text-xs font-medium text-white"
        style={{ backgroundColor: typeConfig.color }}
      >
        {typeConfig.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-4 w-64 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse"></div>
        </div>

        {/* Shifts Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-200 rounded-lg animate-pulse"></div>
                  <div className="space-y-2">
                    <div className="h-5 w-32 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 w-20 bg-gray-200 rounded-full animate-pulse"></div>
                  </div>
                </div>
              </div>
              <div className="h-4 w-full bg-gray-200 rounded animate-pulse mb-4"></div>
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
                <div className="flex gap-2">
                  <div className="w-8 h-8 bg-gray-200 rounded-lg animate-pulse"></div>
                  <div className="w-8 h-8 bg-gray-200 rounded-lg animate-pulse"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg ${
          notification.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
          'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('shiftManagement')}</h1>
          <p className="text-gray-600 mt-1">Manage work shifts and schedules</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Shift
        </button>
      </div>

      {/* Shifts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {shifts.map((shift) => (
          <div key={shift.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: shift.color + '20' }}
                >
                  <Clock className="w-6 h-6" style={{ color: shift.color }} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{shift.name}</h3>
                  <div className="mt-1">{getShiftTypeBadge(shift.shift_type)}</div>
                </div>
              </div>
            </div>

            {shift.description && (
              <p className="text-sm text-gray-600 mb-4">{shift.description}</p>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <span className={`text-sm font-medium ${shift.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                {shift.is_active ? 'Active' : 'Inactive'}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleOpenModal(shift)}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Edit"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(shift)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {shifts.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Clock className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No shifts configured</h3>
          <p className="text-gray-600 mb-4">Get started by creating your first shift</p>
          <button
            onClick={() => handleOpenModal()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <Plus className="w-5 h-5" />
            {t('addShift')}
          </button>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {editingShift ? 'Edit Shift' : 'Add New Shift'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Shift Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Shift Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                  placeholder="e.g., Morning Shift"
                />
              </div>

              {/* Shift Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Shift Type *
                </label>
                <select
                  value={formData.shift_type}
                  onChange={(e) => setFormData({ ...formData, shift_type: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {shiftTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Color
                </label>
                <div className="flex gap-4 items-center">
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-20 h-10 rounded border border-gray-300 cursor-pointer"
                  />
                  <span className="text-sm text-gray-600">{formData.color}</span>
                  <div className="flex gap-2">
                    {shiftTypes.map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, color: type.color })}
                        className="w-8 h-8 rounded border-2 border-transparent hover:border-gray-400"
                        style={{ backgroundColor: type.color }}
                        title={type.label}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  rows="3"
                  placeholder="Brief description of the shift"
                />
              </div>

              {/* Active Status */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                  Active
                </label>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-6 border-t border-gray-200">
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                >
                  <Save className="w-5 h-5" />
                  {editingShift ? 'Update Shift' : 'Create Shift'}
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

export default ShiftManagement;
