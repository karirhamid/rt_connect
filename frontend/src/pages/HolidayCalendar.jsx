import { useState, useEffect } from 'react';
import { Calendar, Plus, Edit2, Trash2, Save, X, Download, Upload } from 'lucide-react';
import api from '../services/api';
import Dialog, { Toast } from '../components/Dialog';
import { useTranslation } from 'react-i18next';

function HolidayCalendar() {
  const { t } = useTranslation();
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [showModal, setShowModal] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [notification, setNotification] = useState(null);
  const [dialog, setDialog] = useState({ isOpen: false, type: '', title: '', message: '', onConfirm: null });
  const [toast, setToast] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    date: '',
    holiday_type: 'public_holiday',
    is_paid: true,
    country: 'MA',
    region: '',
    description: ''
  });

  const holidayTypes = [
    { value: 'public_holiday', label: t('publicHoliday'), color: '#10B981' },
    { value: 'national_day', label: t('nationalDay'), color: '#3B82F6' },
    { value: 'aid', label: t('aidHoliday'), color: '#F59E0B' },
    { value: 'custom', label: t('customHoliday'), color: '#8B5CF6' }
  ];

  const months = [
    t('monthJan'), t('monthFeb'), t('monthMar'), t('monthApr'), t('monthMay'), t('monthJun'),
    t('monthJul'), t('monthAug'), t('monthSep'), t('monthOct'), t('monthNov'), t('monthDec')
  ];

  useEffect(() => {
    loadHolidays();
  }, [currentYear]);

  const loadHolidays = async () => {
    try {
      setLoading(true);
      const data = await api.getHolidaysByYear(currentYear);
      setHolidays(data);
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

  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year, month) => {
    return new Date(year, month, 1).getDay();
  };

  const getHolidaysForDate = (year, month, day) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return holidays.filter(h => h.date === dateStr);
  };

  const handleOpenModal = (holiday = null) => {
    if (holiday) {
      setEditingHoliday(holiday);
      setFormData({
        name: holiday.name,
        date: holiday.date,
        holiday_type: holiday.holiday_type,
        is_paid: holiday.is_paid,
        country: holiday.country || 'MA',
        region: holiday.region || '',
        description: holiday.description || ''
      });
    } else {
      setEditingHoliday(null);
      setFormData({
        name: '',
        date: '',
        holiday_type: 'public_holiday',
        is_paid: true,
        country: 'MA',
        region: '',
        description: ''
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingHoliday(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const action = editingHoliday ? 'update' : 'create';
    const actionText = editingHoliday ? t('editHoliday') : t('addHoliday');
    
    setDialog({
      isOpen: true,
      type: 'confirm',
      title: actionText,
      message: `${actionText}: ${formData.name} - ${formData.date}`,
      confirmText: actionText,
      cancelText: t('cancel'),
      onConfirm: async () => {
        setDialog({ ...dialog, loading: true });
        try {
          if (editingHoliday) {
            await api.updateHoliday(editingHoliday.id, formData);
            showToast(t('holidayUpdated') || 'Holiday updated!', 'success');
          } else {
            await api.createHoliday(formData);
            showToast(t('holidayCreated') || 'Holiday created!', 'success');
          }
          
          setDialog({ isOpen: false });
          handleCloseModal();
          loadHolidays();
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

  const handleDelete = (holiday) => {
    setDialog({
      isOpen: true,
      type: 'warning',
      title: t('delete'),
      message: `${t('confirmDeletion')}: ${holiday.name} - ${holiday.date}. ${t('actionCannotBeUndone')}`,
      confirmText: t('delete'),
      cancelText: t('cancel'),
      onConfirm: async () => {
        setDialog({ ...dialog, loading: true });
        try {
          await api.deleteHoliday(holiday.id);
          setDialog({ isOpen: false });
          showToast(t('holidayDeleted') || 'Holiday deleted!', 'success');
          loadHolidays();
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

  const getTypeColor = (type) => {
    const typeConfig = holidayTypes.find(t => t.value === type);
    return typeConfig ? typeConfig.color : '#6B7280';
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
    const days = [];

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="min-h-[100px] bg-gray-50"></div>);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dayHolidays = getHolidaysForDate(currentYear, currentMonth, day);
      const isToday = 
        day === new Date().getDate() && 
        currentMonth === new Date().getMonth() && 
        currentYear === new Date().getFullYear();

      days.push(
        <div
          key={day}
          className={`min-h-[100px] border border-gray-200 p-2 ${
            isToday ? 'bg-blue-50 border-blue-300' : 'bg-white'
          }`}
        >
          <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>
            {day}
          </div>
          <div className="space-y-1">
            {dayHolidays.map((holiday) => (
              <div
                key={holiday.id}
                className="text-xs p-1 rounded cursor-pointer hover:opacity-80 text-white"
                style={{ backgroundColor: getTypeColor(holiday.holiday_type) }}
                onClick={() => handleOpenModal(holiday)}
                title={holiday.name}
              >
                <div className="truncate font-medium">{holiday.name.split('/')[0].trim()}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return days;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-4 w-64 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="h-[600px] bg-gray-100 rounded animate-pulse"></div>
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
          <h1 className="text-2xl font-bold text-gray-900">{t('holidayCalendar')}</h1>
          <p className="text-gray-600 mt-1">{t('moroccoHolidays')}</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          {t('addHoliday')}
        </button>
      </div>

      {/* Year Navigation */}
      <div className="bg-white rounded-lg shadow-md p-4 flex items-center justify-between">
          <button
            onClick={() => setCurrentYear(currentYear - 1)}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            ← {t('previous')}
          </button>
          <h2 className="text-xl font-bold text-gray-900">{currentYear}</h2>
          <button
            onClick={() => setCurrentYear(currentYear + 1)}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {t('next')} →
          </button>
        </div>
      

      {/* Month Navigation */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              if (currentMonth === 0) {
                setCurrentMonth(11);
                setCurrentYear(currentYear - 1);
              } else {
                setCurrentMonth(currentMonth - 1);
              }
            }}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            ← {t('previousMonth')}
          </button>
          <h3 className="text-lg font-semibold text-gray-900">{months[currentMonth]}</h3>
          <button
            onClick={() => {
              if (currentMonth === 11) {
                setCurrentMonth(0);
                setCurrentYear(currentYear + 1);
              } else {
                setCurrentMonth(currentMonth + 1);
              }
            }}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {t('nextMonth')} →
          </button>
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {[t('sun'), t('mon'), t('tue'), t('wed'), t('thu'), t('fri'), t('sat')].map((day) => (
            <div key={day} className="p-3 text-center text-sm font-semibold text-gray-700">
              {day}
            </div>
          ))}
        </div>
        {/* Calendar Grid */}
        <div className="grid grid-cols-7">
          {renderCalendar()}
        </div>
      </div>

      {/* Holiday List */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {t('holidaysInYear', { year: currentYear })} ({holidays.length})
          </h3>
        </div>
        <div className="divide-y divide-gray-200">
          {holidays.map((holiday) => (
            <div key={holiday.id} className="p-4 hover:bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: getTypeColor(holiday.holiday_type) }}
                ></div>
                <div>
                  <h4 className="font-medium text-gray-900">{holiday.name}</h4>
                  <p className="text-sm text-gray-600">
                    {new Date(holiday.date + 'T00:00:00').toLocaleDateString('en-US', { 
                      month: 'long', 
                      day: 'numeric',
                      year: 'numeric'
                    })}
                    {holiday.is_paid && <span className="ml-2 text-green-600">• {t('paidHoliday')}</span>}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleOpenModal(holiday)}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(holiday)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {editingHoliday ? t('editHoliday') : t('addHoliday')}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('holidayName')} *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                  placeholder={t('holidayNamePlaceholder')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('date')} *
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('holidayType')} *
                </label>
                <select
                  value={formData.holiday_type}
                  onChange={(e) => setFormData({ ...formData, holiday_type: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {holidayTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('description')}
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  rows="3"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_paid"
                  checked={formData.is_paid}
                  onChange={(e) => setFormData({ ...formData, is_paid: e.target.checked })}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="is_paid" className="text-sm font-medium text-gray-700">
                  {t('paidHoliday')}
                </label>
              </div>

              <div className="flex gap-3 pt-6 border-t border-gray-200">
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                >
                  <Save className="w-5 h-5" />
                  {editingHoliday ? t('updateHoliday') : t('addHoliday')}
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
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

export default HolidayCalendar;
