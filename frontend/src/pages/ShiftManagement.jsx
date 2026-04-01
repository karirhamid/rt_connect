import { useState, useEffect } from 'react';
import { Clock, Plus, Edit2, Trash2, Save, X, Loader2, Calendar, Users, Timer, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import Dialog, { Toast } from '../components/Dialog';

const DAY_NAMES_KEYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

function ShiftManagement() {
  const { t } = useTranslation();
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [notification, setNotification] = useState(null);
  const [dialog, setDialog] = useState({ isOpen: false, type: '', title: '', message: '', onConfirm: null });
  const [toast, setToast] = useState(null);
  const [expandedShift, setExpandedShift] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    shift_type: 'regular',
    color: '#3B82F6',
    description: '',
    is_active: true,
    timings: []
  });

  const shiftTypes = [
    { value: 'regular', label: t('regular'), color: '#3B82F6' },
    { value: 'night', label: t('night'), color: '#6366F1' },
    { value: 'weekend', label: t('weekend'), color: '#10B981' },
    { value: 'guard', label: t('guard'), color: '#F59E0B' },
    { value: 'holiday', label: t('holiday'), color: '#EF4444' },
    { value: 'aid', label: t('aid'), color: '#F59E0B' }
  ];

  const defaultTiming = {
    day_of_week: null,
    start_time: '08:00',
    end_time: '17:00',
    break_duration_minutes: 60,
    is_overnight: false,
    late_grace_minutes: 15,
    early_leave_grace_minutes: 15
  };

  useEffect(() => {
    loadShifts();
  }, []);

  const loadShifts = async () => {
    try {
      setLoading(true);
      const data = await api.getShifts();
      setShifts(data);
    } catch (error) {
      showNotification('error', t('failedToLoadData') + ': ' + error.message);
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
        is_active: shift.is_active,
        timings: (shift.timings || []).map(tm => ({
          id: tm.id,
          day_of_week: tm.day_of_week,
          start_time: tm.start_time?.slice(0, 5) || '08:00',
          end_time: tm.end_time?.slice(0, 5) || '17:00',
          break_duration_minutes: tm.break_duration_minutes ?? 60,
          is_overnight: tm.is_overnight || false,
          late_grace_minutes: tm.late_grace_minutes ?? 15,
          early_leave_grace_minutes: tm.early_leave_grace_minutes ?? 15
        }))
      });
    } else {
      setEditingShift(null);
      setFormData({
        name: '',
        shift_type: 'regular',
        color: '#3B82F6',
        description: '',
        is_active: true,
        timings: [{ ...defaultTiming }]
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
      is_active: true,
      timings: []
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const action = editingShift ? 'update' : 'create';
    const actionText = editingShift ? t('edit') : t('createShift');
    
    // Prepare payload — separate timings for update flow
    const shiftPayload = {
      name: formData.name,
      shift_type: formData.shift_type,
      color: formData.color,
      description: formData.description,
      is_active: formData.is_active
    };

    // For create, include timings in payload. For update, we sync timings separately.
    if (!editingShift) {
      shiftPayload.timings = formData.timings.map(tm => ({
        day_of_week: tm.day_of_week,
        start_time: tm.start_time,
        end_time: tm.end_time,
        break_duration_minutes: tm.break_duration_minutes,
        is_overnight: tm.is_overnight,
        late_grace_minutes: tm.late_grace_minutes,
        early_leave_grace_minutes: tm.early_leave_grace_minutes
      }));
    }

    setDialog({
      isOpen: true,
      type: 'confirm',
      title: actionText,
      message: `${t('confirmAction') || 'Are you sure?'} - ${formData.name}`,
      confirmText: actionText,
      cancelText: t('cancel'),
      onConfirm: async () => {
        setDialog({ ...dialog, loading: true });
        try {
          if (editingShift) {
            // 1) Update shift metadata
            await api.updateShift(editingShift.id, shiftPayload);

            // 2) Sync timings: delete removed, update existing, add new
            const existingTimingIds = (editingShift.timings || []).map(t => t.id);
            const formTimingIds = formData.timings.filter(t => t.id).map(t => t.id);

            // Delete timings that were removed
            for (const id of existingTimingIds) {
              if (!formTimingIds.includes(id)) {
                try { await api.deleteShiftTiming(editingShift.id, id); } catch(e) { /* ignore */ }
              }
            }

            // Update existing / add new timings
            for (const tm of formData.timings) {
              const payload = {
                day_of_week: tm.day_of_week,
                start_time: tm.start_time,
                end_time: tm.end_time,
                break_duration_minutes: tm.break_duration_minutes,
                is_overnight: tm.is_overnight,
                late_grace_minutes: tm.late_grace_minutes,
                early_leave_grace_minutes: tm.early_leave_grace_minutes
              };
              if (tm.id) {
                await api.updateShiftTiming(editingShift.id, tm.id, payload);
              } else {
                await api.addShiftTiming(editingShift.id, payload);
              }
            }

            showToast(t('shiftUpdated') || 'Shift updated successfully!', 'success');
          } else {
            await api.createShift(shiftPayload);
            showToast(t('shiftCreated') || 'Shift created successfully!', 'success');
          }
          
          setDialog({ isOpen: false });
          handleCloseModal();
          loadShifts();
        } catch (error) {
          setDialog({
            isOpen: true,
            type: 'error',
            title: t('operationFailed'),
            message: `${t('operationFailed')}: ${error.message}`,
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
      title: t('delete'),
      message: `${t('confirmDeletion')}: ${shift.name}. ${t('actionCannotBeUndone')}`,
      confirmText: t('delete'),
      cancelText: t('cancel'),
      onConfirm: async () => {
        setDialog({ ...dialog, loading: true });
        try {
          await api.deleteShift(shift.id);
          setDialog({ isOpen: false });
          showToast(t('shiftDeleted') || 'Shift deleted successfully!', 'success');
          loadShifts();
        } catch (error) {
          setDialog({
            isOpen: true,
            type: 'error',
            title: t('deleteFailedTitle'),
            message: `${t('deleteFailedTitle')}: ${error.message}`,
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
          <p className="text-gray-600 mt-1">{t('manageShiftsDesc')}</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          {t('addShift')}
        </button>
      </div>

      {/* Shifts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {shifts.map((shift) => {
          const mainTiming = (shift.timings || []).find(t => t.day_of_week === null) || (shift.timings || [])[0];
          const isExpanded = expandedShift === shift.id;
          return (
          <div key={shift.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
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
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${shift.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                  {shift.is_active ? t('active') : t('inactive')}
                </span>
              </div>

              {shift.description && (
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{shift.description}</p>
              )}

              {/* Main timing info */}
              {mainTiming && (
                <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      <span className="font-medium text-gray-700">{mainTiming.start_time?.slice(0,5)} — {mainTiming.end_time?.slice(0,5)}</span>
                      {mainTiming.is_overnight && <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">{t('overnight') || 'Overnight'}</span>}
                    </div>
                    {mainTiming.break_duration_minutes > 0 && (
                      <span className="text-xs text-gray-400">{mainTiming.break_duration_minutes} min {t('break') || 'break'}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Timer className="w-3 h-3 text-amber-500" />
                      <span className="text-gray-600">{t('lateGrace') || 'Late grace'}: <strong className="text-gray-800">{mainTiming.late_grace_minutes ?? 15} min</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Timer className="w-3 h-3 text-orange-500" />
                      <span className="text-gray-600">{t('earlyLeaveGrace') || 'Early leave'}: <strong className="text-gray-800">{mainTiming.early_leave_grace_minutes ?? 15} min</strong></span>
                    </div>
                  </div>
                </div>
              )}

              {/* Expand to see per-day timings */}
              {(shift.timings || []).length > 1 && (
                <button
                  onClick={() => setExpandedShift(isExpanded ? null : shift.id)}
                  className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 mb-2 transition-colors"
                >
                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {isExpanded ? t('hideDayTimings') || 'Hide day timings' : `${t('showDayTimings') || 'Show day timings'} (${(shift.timings || []).length})`}
                </button>
              )}

              {isExpanded && (shift.timings || []).length > 1 && (
                <div className="space-y-1.5 mb-3">
                  {(shift.timings || []).map(tm => (
                    <div key={tm.id} className="flex items-center justify-between text-xs bg-white border rounded-lg px-3 py-2">
                      <span className="font-medium text-gray-700 w-20">
                        {tm.day_of_week !== null && tm.day_of_week !== undefined ? t(DAY_NAMES_KEYS[tm.day_of_week]) || DAY_NAMES_KEYS[tm.day_of_week] : t('allDays') || 'All days'}
                      </span>
                      <span className="text-gray-600">{tm.start_time?.slice(0,5)} — {tm.end_time?.slice(0,5)}</span>
                      <span className="text-amber-600">{tm.late_grace_minutes ?? 15}m / {tm.early_leave_grace_minutes ?? 15}m</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  onClick={() => handleOpenModal(shift)}
                  className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                  title={t('edit')}
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(shift)}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title={t('delete')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {/* Empty State */}
      {shifts.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Clock className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">{t('noShiftsConfigured')}</h3>
          <p className="text-gray-600 mb-4">{t('createFirstShiftPrompt')}</p>
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingShift ? t('editShift') : t('addNewShift')}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">{t('configureShiftTimingsGrace') || 'Configure shift details, timings, and grace periods'}</p>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {/* ── Basic Info Section ── */}
                <div className="bg-gray-50 rounded-lg p-5 border border-gray-100 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                    <Clock className="w-4 h-4" /> {t('basicInfo') || 'Basic Info'}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('shiftName')} <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                        required
                        placeholder={t('shiftNamePlaceholder')}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('shiftType')} <span className="text-red-500">*</span></label>
                      <select
                        value={formData.shift_type}
                        onChange={(e) => setFormData({ ...formData, shift_type: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                      >
                        {shiftTypes.map((type) => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('color')}</label>
                      <div className="flex gap-3 items-center">
                        <input
                          type="color"
                          value={formData.color}
                          onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                          className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                        />
                        <div className="flex gap-1.5 flex-wrap">
                          {shiftTypes.map((type) => (
                            <button
                              key={type.value}
                              type="button"
                              onClick={() => setFormData({ ...formData, color: type.color })}
                              className={`w-7 h-7 rounded-md border-2 transition-transform hover:scale-110 ${formData.color === type.color ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                              style={{ backgroundColor: type.color }}
                              title={type.label}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.is_active}
                          onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                          className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm font-medium text-gray-700">{t('shiftActive')}</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('description')}</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                      rows="2"
                      placeholder={t('description')}
                    />
                  </div>
                </div>

                {/* ── Timings Section ── */}
                <div className="bg-gray-50 rounded-lg p-5 border border-gray-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                      <Timer className="w-4 h-4" /> {t('shiftTimings') || 'Shift Timings & Grace Periods'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, timings: [...formData.timings, { ...defaultTiming }] })}
                      className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 px-2.5 py-1.5 rounded-lg hover:bg-primary-50 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> {t('addTiming') || 'Add Timing'}
                    </button>
                  </div>

                  {formData.timings.length === 0 && (
                    <div className="text-center py-8 text-gray-400">
                      <Timer className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{t('noTimings') || 'No timings configured. Add a timing to define work hours and grace periods.'}</p>
                    </div>
                  )}

                  {formData.timings.map((timing, idx) => (
                    <div key={idx} className="bg-white rounded-lg border border-gray-200 p-4 relative">
                      {/* Remove button */}
                      {formData.timings.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newTimings = formData.timings.filter((_, i) => i !== idx);
                            setFormData({ ...formData, timings: newTimings });
                          }}
                          className="absolute top-3 right-3 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}

                      {/* Row 1: Day + Times */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('dayOfWeek') || 'Day'}</label>
                          <select
                            value={timing.day_of_week ?? ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? null : parseInt(e.target.value);
                              const newTimings = [...formData.timings];
                              newTimings[idx] = { ...newTimings[idx], day_of_week: val };
                              setFormData({ ...formData, timings: newTimings });
                            }}
                            className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          >
                            <option value="">{t('allDays') || 'All Days'}</option>
                            {DAY_NAMES_KEYS.map((day, i) => (
                              <option key={i} value={i}>{t(day) || day}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('startTime') || 'Start'}</label>
                          <input
                            type="time"
                            value={timing.start_time}
                            onChange={(e) => {
                              const newTimings = [...formData.timings];
                              newTimings[idx] = { ...newTimings[idx], start_time: e.target.value };
                              setFormData({ ...formData, timings: newTimings });
                            }}
                            className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('endTime') || 'End'}</label>
                          <input
                            type="time"
                            value={timing.end_time}
                            onChange={(e) => {
                              const newTimings = [...formData.timings];
                              newTimings[idx] = { ...newTimings[idx], end_time: e.target.value };
                              setFormData({ ...formData, timings: newTimings });
                            }}
                            className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('breakMinutes') || 'Break (min)'}</label>
                          <input
                            type="number"
                            min="0"
                            value={timing.break_duration_minutes}
                            onChange={(e) => {
                              const newTimings = [...formData.timings];
                              newTimings[idx] = { ...newTimings[idx], break_duration_minutes: parseInt(e.target.value) || 0 };
                              setFormData({ ...formData, timings: newTimings });
                            }}
                            className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          />
                        </div>
                      </div>

                      {/* Row 2: Grace periods + overnight toggle */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-amber-700 mb-1 flex items-center gap-1">
                            <Timer className="w-3 h-3" /> {t('lateGraceMinutes') || 'Late Grace (min)'}
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max="120"
                              value={timing.late_grace_minutes}
                              onChange={(e) => {
                                const newTimings = [...formData.timings];
                                newTimings[idx] = { ...newTimings[idx], late_grace_minutes: parseInt(e.target.value) || 0 };
                                setFormData({ ...formData, timings: newTimings });
                              }}
                              className="w-full px-2.5 py-2 border border-amber-200 bg-amber-50/50 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                            />
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{t('lateGraceHint') || 'Employee won\'t be marked late within this period'}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-orange-700 mb-1 flex items-center gap-1">
                            <Timer className="w-3 h-3" /> {t('earlyLeaveGraceMinutes') || 'Early Leave Grace (min)'}
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max="120"
                              value={timing.early_leave_grace_minutes}
                              onChange={(e) => {
                                const newTimings = [...formData.timings];
                                newTimings[idx] = { ...newTimings[idx], early_leave_grace_minutes: parseInt(e.target.value) || 0 };
                                setFormData({ ...formData, timings: newTimings });
                              }}
                              className="w-full px-2.5 py-2 border border-orange-200 bg-orange-50/50 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                            />
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{t('earlyLeaveGraceHint') || 'Won\'t be flagged for leaving early within this period'}</p>
                        </div>
                        <div className="flex items-center pt-5">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={timing.is_overnight}
                              onChange={(e) => {
                                const newTimings = [...formData.timings];
                                newTimings[idx] = { ...newTimings[idx], is_overnight: e.target.checked };
                                setFormData({ ...formData, timings: newTimings });
                              }}
                              className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            />
                            <span className="text-sm text-gray-700">{t('overnightShift') || 'Overnight shift'}</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium text-sm shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  {editingShift ? t('updateShift') : t('createShift')}
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm"
                >
                  {t('cancel')}
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
