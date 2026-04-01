import { useState, useEffect } from 'react';
import { Search, Filter, Download, Calendar, Users, Building2, Loader2, X, FileText, Edit2, Trash2, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

function AttendanceFilter() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    employeeId: '',
    employeeName: '',
    departmentId: '',
    companyId: '',
    status: 'all' // all, present, late, absent
  });
  
  const [attendanceData, setAttendanceData] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [totalRecords, setTotalRecords] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    date: '',
    time: '',
    status: 0
  });

  useEffect(() => {
    loadFiltersData();
  }, []);

  const loadFiltersData = async () => {
    try {
      const [companiesRes, departmentsRes] = await Promise.all([
        api.getCompanies(),
        api.getDepartments()
      ]);
      setCompanies(companiesRes.companies || []);
      setDepartments(departmentsRes.departments || []);
    } catch (error) {
      console.error('Failed to load filter data:', error);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleSearch = async () => {
    setLoading(true);
    try {
      const data = await api.getAttendanceFiltered(filters);
      
      setAttendanceData(data.attendance || []);
      setTotalRecords(data.count || 0);
    } catch (error) {
      console.error('Search failed:', error);
      alert(t('failedToSearch') + ': ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFilters({
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      employeeId: '',
      employeeName: '',
      departmentId: '',
      companyId: '',
      status: 'all'
    });
    setAttendanceData([]);
    setTotalRecords(0);
  };

  const handleExport = async (format) => {
    try {
      // TODO: Implement export functionality
      console.log(`Exporting to ${format}...`);
      alert(t('exportNotImplemented'));
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const calculateWorkHours = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return '-';
    const diff = new Date(checkOut) - new Date(checkIn);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    setEditForm({
      date: record.date,
      time: record.time,
      status: record.status
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({ date: '', time: '', status: 0 });
  };

  const handleSaveEdit = async (recordId) => {
    try {
      const timestamp = `${editForm.date}T${editForm.time}`;
      await api.updateAttendance(recordId, {
        timestamp: timestamp,
        status: editForm.status
      });
      
      // Refresh data
      await handleSearch();
      setEditingId(null);
      alert(t('recordUpdated'));
    } catch (error) {
      console.error('Failed to update attendance:', error);
      alert(`${t('updateFailed')}: ` + error.message);
    }
  };

  const handleDelete = async (recordId, employeeName) => {
    if (!confirm(`${t('confirmDelete')} ${employeeName}?`)) {
      return;
    }
    
    try {
      await api.deleteAttendance(recordId);
      // Refresh data
      await handleSearch();
      alert(t('recordDeleted'));
    } catch (error) {
      console.error('Failed to delete attendance:', error);
      alert(`${t('deleteFailed')}: ` + error.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('filterAttendance')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('searchAnalyze')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleExport('excel')}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            {t('export')} Excel
          </button>
          <button
            onClick={() => handleExport('pdf')}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <FileText className="w-4 h-4" />
            {t('export')} PDF
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('filter')} {t('filters')}</h2>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            {showFilters ? t('hide') : t('show')} {t('filters')}
          </button>
        </div>

        {showFilters && (
          <div className="p-6 space-y-4">
            {/* Date Range */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  {t('from')}
                </label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  {t('to')}
                </label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Company and Department */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Building2 className="w-4 h-4 inline mr-1" />
                  {t('company')}
                </label>
                <select
                  value={filters.companyId}
                  onChange={(e) => handleFilterChange('companyId', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">{t('allCompanies')}</option>
                  {companies.map(company => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Users className="w-4 h-4 inline mr-1" />
                  {t('department')}
                </label>
                <select
                  value={filters.departmentId}
                  onChange={(e) => handleFilterChange('departmentId', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">{t('allDepartments')}</option>
                  {departments
                    .filter(d => !filters.companyId || d.company_id === parseInt(filters.companyId))
                    .map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                </select>
              </div>
            </div>

            {/* Employee Search */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('deviceUserId')}
                </label>
                <input
                  type="text"
                  value={filters.employeeId}
                  onChange={(e) => handleFilterChange('employeeId', e.target.value)}
                  placeholder={t('deviceUserId')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('employeeName')}
                </label>
                <input
                  type="text"
                  value={filters.employeeName}
                  onChange={(e) => handleFilterChange('employeeName', e.target.value)}
                  placeholder={t('enterEmployeeName')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('attendanceStatus')}
              </label>
              <div className="flex gap-3">
                {[{value: 'all', label: t('statusAll')}, {value: 'present', label: t('statusPresent')}, {value: 'late', label: t('statusLate')}, {value: 'absent', label: t('statusAbsent')}].map(({value, label}) => (
                  <label key={value} className="flex items-center">
                    <input
                      type="radio"
                      value={value}
                      checked={filters.status === value}
                      onChange={(e) => handleFilterChange('status', e.target.value)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={handleSearch}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('searching')}
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    {t('searchButton')}
                  </>
                )}
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <X className="w-4 h-4" />
                {t('reset')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Results Summary */}
      {totalRecords > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">
                {totalRecords} {t('records')}
              </span>
            </div>
            <span className="text-xs text-blue-700">
              {formatDate(filters.startDate)} - {formatDate(filters.endDate)}
            </span>
          </div>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <th key={i} className="px-6 py-3">
                      <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <tr key={i}>
                    {[1, 2, 3, 4, 5, 6].map((j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : attendanceData.length === 0 ? (
          <div className="p-12 text-center">
            <Search className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">{t('noRecordsFound')}</p>
            <p className="text-gray-400 text-sm mt-2">{t('tryAdjusting')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('date')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('time')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('employee')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('department')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('type')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('device')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {attendanceData.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {editingId === record.id ? (
                        <input
                          type="date"
                          value={editForm.date}
                          onChange={(e) => setEditForm({...editForm, date: e.target.value})}
                          className="px-2 py-1 border border-gray-300 rounded"
                        />
                      ) : (
                        formatDate(record.timestamp)
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {editingId === record.id ? (
                        <input
                          type="time"
                          value={editForm.time}
                          onChange={(e) => setEditForm({...editForm, time: e.target.value})}
                          className="px-2 py-1 border border-gray-300 rounded"
                        />
                      ) : (
                        formatTime(record.timestamp)
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{record.employee_name}</div>
                      <div className="text-xs text-gray-500">{record.employee_id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {record.department}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingId === record.id ? (
                        <select
                          value={editForm.status}
                          onChange={(e) => setEditForm({...editForm, status: parseInt(e.target.value)})}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          <option value={0}>{t('checkIn')}</option>
                          <option value={1}>{t('checkOut')}</option>
                        </select>
                      ) : (
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          record.punch === 0 ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {record.punch === 0 ? t('checkIn') : t('checkOut')}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {record.device_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {editingId === record.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveEdit(record.id)}
                            className="text-green-600 hover:text-green-900 flex items-center gap-1"
                          >
                            <Save className="w-4 h-4" />
                            {t('save')}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            {t('cancel')}
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(record)}
                            className="text-blue-600 hover:text-blue-900 flex items-center gap-1"
                          >
                            <Edit2 className="w-4 h-4" />
                            {t('edit')}
                          </button>
                          <button
                            onClick={() => handleDelete(record.id, record.employee_name)}
                            className="text-red-600 hover:text-red-900 flex items-center gap-1"
                          >
                            <Trash2 className="w-4 h-4" />
                            {t('delete')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AttendanceFilter;
