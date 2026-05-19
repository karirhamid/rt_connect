import { useState, useEffect } from 'react';
import { Users, Plus, Edit, Trash2, X, Save, Loader2, CheckCircle, AlertCircle, Search, Building2, Briefcase, Mail, Phone, Calendar, Clock, FileText, Coffee, Copy, ChevronUp, ChevronDown, ChevronsUpDown, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

const canManageEmployees = () => {
  try { return JSON.parse(localStorage.getItem('_userPerms') || '[]').includes('employees.manage'); }
  catch { return false; }
};
import Dialog, { Toast } from '../components/Dialog';
import SyncOverlay from '../components/SyncOverlay';

function EmployeeManagement() {
  const { t } = useTranslation();
  const [employees, setEmployees] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterDevice, setFilterDevice] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [employeeShifts, setEmployeeShifts] = useState({});
  const [dialog, setDialog] = useState({ isOpen: false, type: '', title: '', message: '', onConfirm: null });
  const [toast, setToast] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [syncOverlay, setSyncOverlay] = useState({ visible: false, phase: 'saving' });
  const [sortKey, setSortKey] = useState('user_id');
  const [sortDir, setSortDir] = useState('asc');
  const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const emptyWeekSchedule = () => DAY_KEYS.map((_, i) => ({
    day_of_week: i, is_day_off: false, work_start: '', work_end: '',
    has_break: false, break_start: '', break_end: '',
  }));
  const [scheduleData, setScheduleData] = useState(emptyWeekSchedule());

  const exportPDF = async () => {
    setExportingPdf(true);
    try {
      const params = new URLSearchParams();
      if (filterCompany) params.append('company_id', filterCompany);
      if (filterDepartment) params.append('department_id', filterDepartment);
      if (filterDevice) {
        params.append('device_id', filterDevice);
        const dev = devices.find(d => d.id === filterDevice);
        if (dev?.name) params.append('device_name', dev.name);
      }
      params.append('lang', document.documentElement.lang || 'en');
      const resp = await api.authFetch(`/api/reports/employees/export.pdf?${params}`, { method: 'GET' });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || (t('exportFailed') || 'Export failed'));
      }
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'employees_list.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      showToast(e?.message || 'PDF export failed', 'error');
    } finally {
      setExportingPdf(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!loading) {
      loadEmployees();
    }
  }, [filterCompany, filterDepartment, filterDevice]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [companiesRes, departmentsRes, positionsRes, devicesRes] = await Promise.all([
        api.getCompanies(),
        api.getDepartments(),
        api.getPositions(),
        api.getDevices()
      ]);

      setCompanies(companiesRes.companies || []);
      setDepartments(departmentsRes.departments || []);
      setPositions(positionsRes.positions || []);
      setDevices(devicesRes.devices || []);

      await loadEmployees();
    } catch (error) {
      console.error('Failed to load data:', error);
      showNotification('error', (t('failedToLoadData') || 'Échec du chargement des données') + ': ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      const params = {};
      if (filterCompany) params.company_id = filterCompany;
      if (filterDepartment) params.department_id = filterDepartment;
      if (filterDevice) params.device_id = filterDevice;

      const employeesRes = await api.getEmployees(params);
      const employeesList = employeesRes.employees || [];
      setEmployees(employeesList);

      const shiftsMap = {};
      await Promise.all(
        employeesList.map(async (emp) => {
          try {
            const shift = await api.getEmployeeCurrentShift(emp.id);
            if (shift) shiftsMap[emp.id] = shift;
          } catch (error) {
            console.debug(`No shift for employee ${emp.id}`);
          }
        })
      );
      setEmployeeShifts(shiftsMap);
    } catch (error) {
      console.error('Failed to load employees:', error);
      showNotification('error', (t('failedToLoadEmployees') || 'Échec du chargement des employés') + ': ' + error.message);
    }
  };

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), type === 'warning' ? 5000 : 3000);
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleAdd = () => {
    setEditingEmployee(null);
    setFormData({
      device_user_id: '',
      user_id: '',
      firstName: '',
      lastName: '',
      name: '',
      email: '',
      phone: '',
      company_id: '',
      department_id: '',
      position_id: '',
      privilege: 0,
      card_number: '',
      hire_date: '',
      birth_date: '',
      gender: '',
      address: ''
    });
    setScheduleData(emptyWeekSchedule());
    setShowModal(true);
  };

  const handleEdit = (employee) => {
    setEditingEmployee(employee);
    const nameParts = (employee.name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    setFormData({
      device_user_id: employee.device_user_id || '',
      user_id: employee.user_id || '',
      firstName,
      lastName,
      name: employee.name || '',
      email: employee.email || '',
      phone: employee.phone || '',
      company_id: employee.company_id || '',
      department_id: employee.department_id || '',
      position_id: employee.position_id || '',
      privilege: employee.privilege || 0,
      card_number: employee.card_number || '',
      hire_date: employee.hire_date ? employee.hire_date.split('T')[0] : '',
      birth_date: employee.birth_date ? employee.birth_date.split('T')[0] : '',
      gender: employee.gender || '',
      address: employee.address || ''
    });
    setScheduleData(emptyWeekSchedule());
    api.getEmployeePersonalSchedule(employee.id).then(res => {
      if (res.schedule && Array.isArray(res.schedule)) {
        const week = emptyWeekSchedule();
        res.schedule.forEach(d => {
          if (d.day_of_week >= 0 && d.day_of_week <= 6) {
            week[d.day_of_week] = { ...week[d.day_of_week], ...d };
          }
        });
        setScheduleData(week);
      }
    }).catch(() => {});
    setShowModal(true);
  };

  const handleDelete = (employee) => {
    setDialog({
      isOpen: true,
      type: 'warning',
      title: t('deleteEmployeeTitle'),
      message: `${t('deleteEmployeeMsg')}: ${employee.name} (${employee.user_id}). ${t('actionCannotBeUndone')}`,
      confirmText: t('delete'),
      cancelText: t('cancel'),
      onConfirm: async () => {
        const devName = devices.find(d => d.id === employee.source_device_id)?.name || '';
        setDialog({ isOpen: false });
        setSyncOverlay({ visible: true, phase: 'syncing', deviceName: devName });
        try {
          await api.deleteEmployee(employee.id);
          setSyncOverlay({ visible: true, phase: 'done', deviceName: devName });
          await new Promise(r => setTimeout(r, 1000));
          setSyncOverlay({ visible: false, phase: 'saving', deviceName: '' });
          showToast(t('employeeDeleted') || 'Employee deleted!', 'success');
          await loadData();
        } catch (error) {
          setSyncOverlay({ visible: true, phase: 'error', deviceName: devName });
          await new Promise(r => setTimeout(r, 1500));
          setSyncOverlay({ visible: false, phase: 'saving', deviceName: '' });
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    const fullName = [formData.firstName, formData.lastName].filter(Boolean).join(' ').trim();

    if (!fullName || !formData.user_id || !formData.device_user_id) {
      setDialog({
        isOpen: true,
        type: 'warning',
        title: t('missingInformation') || 'Missing Information',
        message: t('fillRequiredFields') || 'Please fill in all required fields: First Name, User ID, and Device User ID.',
        onConfirm: null
      });
      return;
    }

    if (!formData.company_id || !formData.department_id) {
      setDialog({
        isOpen: true,
        type: 'warning',
        title: t('missingInformationTitle'),
        message: t('fillRequiredFields') || 'Please select both company and department.',
        onConfirm: null
      });
      return;
    }

    const action = editingEmployee ? 'update' : 'add';
    const actionText = editingEmployee ? t('update') || 'Update' : t('add') || 'Add';

    setDialog({
      isOpen: true,
      type: 'confirm',
      title: `${actionText} ${t('employee') || 'Employee'}`,
      message: `${t('confirmAction') || 'Are you sure you want to'} ${action} "${fullName}" (${formData.user_id})?\n${t('nameSyncedToDevice') || 'Name will be synced to the device.'}`,
      confirmText: `${actionText} ${t('employee') || 'Employee'}`,
      cancelText: t('cancel') || 'Cancel',
      onConfirm: async () => {
        const devName = editingEmployee
          ? devices.find(d => d.id === editingEmployee.source_device_id)?.name || ''
          : '';
        setDialog({ isOpen: false });
        setSyncOverlay({ visible: true, phase: 'saving', deviceName: devName });
        try {
          const employeeData = {
            ...formData,
            name: fullName,
            device_user_id: parseInt(formData.device_user_id),
            company_id: parseInt(formData.company_id),
            department_id: parseInt(formData.department_id),
            position_id: formData.position_id ? parseInt(formData.position_id) : null,
            privilege: parseInt(formData.privilege || 0),
            card_number: formData.card_number ? parseInt(formData.card_number) : null,
            hire_date: formData.hire_date || null,
            birth_date: formData.birth_date || null
          };
          delete employeeData.firstName;
          delete employeeData.lastName;

          setSyncOverlay({ visible: true, phase: 'syncing', deviceName: devName });

          let result;
          let hadSyncWarning = false;
          if (editingEmployee) {
            result = await api.updateEmployee(editingEmployee.id, employeeData);
            if (result.sync_warnings) {
              hadSyncWarning = true;
              const detail = Array.isArray(result.sync_warnings) ? result.sync_warnings.join('; ') : '';
              const isBusy = detail.toLowerCase().includes('busy') || detail.toLowerCase().includes('in progress');
              showToast(
                isBusy
                  ? (t('deviceBusy') || 'Device busy — changes saved, will sync on next cycle.')
                  : (t('syncWarning') || 'Employee saved but device sync failed. Changes will sync on next connection.'),
                'warning'
              );
            } else {
              showToast(t('employeeUpdatedAndSynced') || 'Employee updated and synced to device', 'success');
            }
          } else {
            result = await api.createEmployee(employeeData);
            if (result.sync_warnings) {
              hadSyncWarning = true;
              const detail = Array.isArray(result.sync_warnings) ? result.sync_warnings.join('; ') : '';
              const isBusy = detail.toLowerCase().includes('busy') || detail.toLowerCase().includes('in progress');
              showToast(
                isBusy
                  ? (t('deviceBusy') || 'Device busy — changes saved, will sync on next cycle.')
                  : (t('syncWarning') || 'Employee saved but device sync failed. Changes will sync on next connection.'),
                'warning'
              );
            } else {
              showToast(t('employeeAddedAndSynced') || 'Employee added and synced to device', 'success');
            }
          }

          const empId = editingEmployee ? editingEmployee.id : (result.employee?.id || result.id);
          const hasAnyTiming = scheduleData.some(d => d.work_start && d.work_end);
          if (empId && hasAnyTiming) {
            try {
              await api.saveEmployeePersonalSchedule(empId, { days: scheduleData });
            } catch (e) {
              console.warn('Failed to save schedule:', e);
            }
          } else if (empId && !hasAnyTiming) {
            try {
              await api.deleteEmployeePersonalSchedule(empId);
            } catch (e) { /* No schedule to delete, ignore */ }
          }

          setSyncOverlay({ visible: true, phase: hadSyncWarning ? 'error' : 'done', deviceName: devName });
          await new Promise(r => setTimeout(r, 1200));
          setSyncOverlay({ visible: false, phase: 'saving', deviceName: '' });
          setShowModal(false);
          await loadData();
        } catch (error) {
          setSyncOverlay({ visible: true, phase: 'error', deviceName: devName });
          await new Promise(r => setTimeout(r, 1500));
          setSyncOverlay({ visible: false, phase: 'saving', deviceName: '' });
          setDialog({
            isOpen: true,
            type: 'error',
            title: t('operationFailed') || 'Operation Failed',
            message: `${t('failedTo') || 'Failed to'} ${action}: ${error.message}`,
            onConfirm: null
          });
        }
      }
    });
  };

  // Filter + sort employees
  const filteredEmployees = employees.filter(employee => {
    const matchesSearch = !searchTerm ||
      employee.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.user_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCompany = !filterCompany || employee.company_id === parseInt(filterCompany);
    const matchesDepartment = !filterDepartment || employee.department_id === parseInt(filterDepartment);

    return matchesSearch && matchesCompany && matchesDepartment;
  });

  const sortedEmployees = [...filteredEmployees].sort((a, b) => {
    const av = String(a[sortKey] ?? '');
    const bv = String(b[sortKey] ?? '');
    const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // Get departments for selected company in form
  const availableDepartments = formData.company_id
    ? departments.filter(d => d.company_id === parseInt(formData.company_id))
    : departments;

  // Get positions for selected department in form
  const availablePositions = formData.department_id
    ? positions.filter(p => p.department_id === parseInt(formData.department_id))
    : positions;

  const SortableHeader = ({ label, sortK, className = '' }) => {
    const active = sortKey === sortK;
    return (
      <th
        onClick={() => handleSort(sortK)}
        className={`px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 transition-colors ${className}`}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active
            ? sortDir === 'asc'
              ? <ChevronUp className="w-3 h-3 text-primary-600" />
              : <ChevronDown className="w-3 h-3 text-primary-600" />
            : <ChevronsUpDown className="w-3 h-3 text-gray-300" />
          }
        </span>
      </th>
    );
  };

  const TableHead = () => (
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        <SortableHeader label={t('id') || 'ID'} sortK="user_id" className="w-24" />
        <SortableHeader label={t('employee')} sortK="name" />
        <SortableHeader label={t('department')} sortK="department_name" />
        <SortableHeader label={t('position')} sortK="position_name" />
        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
          {t('currentShift')}
        </th>
        <SortableHeader label={t('role')} sortK="privilege" />
        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
          {t('actions')}
        </th>
      </tr>
    </thead>
  );

  const renderEmployeeRow = (employee) => (
    <>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <span className="text-sm font-mono font-medium text-gray-700">{employee.user_id}</span>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex-shrink-0 h-8 w-8 bg-primary-100 rounded-full flex items-center justify-center">
            <span className="text-primary-700 text-xs font-semibold">
              {employee.name?.charAt(0)?.toUpperCase() || 'U'}
            </span>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900 leading-tight">{employee.name}</div>
            {(employee.email || employee.phone) && (
              <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                {employee.email && <span className="flex items-center gap-0.5"><Mail className="w-2.5 h-2.5" />{employee.email}</span>}
                {employee.phone && <span className="flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{employee.phone}</span>}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-sm text-gray-600">
        {employee.department_name || <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-sm text-gray-500">
        {employee.position_name || <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        {employeeShifts[employee.id] ? (
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: employeeShifts[employee.id].shift.color || '#3B82F6' }}
            />
            <div>
              <div className="text-xs font-medium text-gray-700 leading-tight">{employeeShifts[employee.id].shift.name}</div>
              <div className="text-xs text-gray-400">{employeeShifts[employee.id].shift.start_time} – {employeeShifts[employee.id].shift.end_time}</div>
            </div>
          </div>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <span className={`px-2 py-0.5 inline-flex text-xs font-medium rounded-full ${
          employee.privilege === 14
            ? 'bg-purple-100 text-purple-700'
            : 'bg-gray-100 text-gray-500'
        }`}>
          {employee.privilege === 14 ? t('adminLabel') : t('userLabel')}
        </span>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-right">
        {canManageEmployees() && (<>
          <button
            onClick={() => handleEdit(employee)}
            disabled={saving}
            className="text-primary-500 hover:text-primary-700 mr-3 disabled:opacity-40 transition-colors"
            title={t('edit')}
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={async () => {
              const firstName = (employee.name || '').trim().split(' ')[0] || '?';
              if (!window.confirm((t('resetPortalConfirm') || 'Réinitialiser le mot de passe portail ?') + `\n${t('initialPasswordWillBe') || 'Mot de passe initial'}: "${firstName}"`)) return;
              try {
                await api.post(`/api/employees/${employee.id}/portal-reset`);
                showToast((t('portalPasswordReset') || 'Mot de passe réinitialisé') + `: "${firstName}"`, 'success');
              } catch (e) {
                showToast(e?.response?.data?.detail || e.message, 'error');
              }
            }}
            disabled={saving}
            className="text-amber-500 hover:text-amber-700 mr-3 disabled:opacity-40 transition-colors"
            title={t('resetPortalPassword') || 'Réinitialiser le mot de passe portail'}
          >
            <Lock className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDelete(employee)}
            disabled={saving}
            className="text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors"
            title={t('delete')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>)}
      </td>
    </>
  );

  return (
    <div className="space-y-6">
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-6 py-4 rounded-lg shadow-lg transform transition-all duration-300 ${
          notification.type === 'success'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600" />
          )}
          <span className="font-medium">{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('employeeManagement')}</h1>
          <p className="text-gray-600 mt-1">{t('manageEmployees')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportPDF}
            disabled={exportingPdf || loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 text-gray-700 disabled:opacity-50 transition-colors"
            title={t('exportPDF') || 'Export PDF'}
          >
            {exportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            PDF
          </button>
          {canManageEmployees() && (
            <button
              onClick={handleAdd}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              {t('addEmployee')}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Search className="w-4 h-4 inline mr-1" />
              {t('search')}
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('searchByNameIdEmail')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Building2 className="w-4 h-4 inline mr-1" />
              {t('filterByCompany')}
            </label>
            <select
              value={filterCompany}
              onChange={(e) => {
                setFilterCompany(e.target.value);
                setFilterDepartment('');
              }}
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
              {t('filterByDepartment')}
            </label>
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">{t('allDepartments')}</option>
              {departments
                .filter(d => !filterCompany || d.company_id === parseInt(filterCompany))
                .map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
              {t('filterByDevice')}
            </label>
            <select
              value={filterDevice}
              onChange={(e) => setFilterDevice(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">{t('allDevices')}</option>
              {devices.map(device => (
                <option key={device.id} value={device.id}>{device.name}</option>
              ))}
            </select>
          </div>
        </div>

        {(searchTerm || filterCompany || filterDepartment || filterDevice) && (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {t('showing')} {sortedEmployees.length} {t('of')} {employees.length} {t('employees').toLowerCase()}
            </span>
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterCompany('');
                setFilterDepartment('');
                setFilterDevice('');
              }}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              {t('clearFilters')}
            </button>
          </div>
        )}
      </div>

      {/* Employee Table */}
      {loading ? (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="grid grid-cols-7 gap-4 items-center">
                <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
                <div className="col-span-2 h-8 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>
      ) : sortedEmployees.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg mb-2">
            {searchTerm || filterCompany || filterDepartment ? t('noEmployeesFound') : t('noEmployeesYet')}
          </p>
          <p className="text-gray-400 text-sm">
            {searchTerm || filterCompany || filterDepartment
              ? t('tryAdjustingFilters')
              : t('clickAddEmployee')}
          </p>
        </div>
      ) : filterDevice ? (
        // Single device view
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {sortedEmployees.length} {t('employees').toLowerCase()}
            </span>
            <span className="text-xs text-gray-400">
              {t('sortBy') || 'Sort by'}: <strong className="text-primary-600">{sortKey}</strong> ({sortDir})
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <TableHead />
              <tbody className="bg-white divide-y divide-gray-100">
                {sortedEmployees.map(employee => (
                  <tr key={employee.id} className="hover:bg-gray-50 transition-colors">
                    {renderEmployeeRow(employee)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // All devices — grouped by device
        <div className="space-y-4">
          {devices.map(device => {
            const deviceEmployees = sortedEmployees.filter(emp =>
              emp.source_device_id === device.id ||
              emp.source_device_name === device.name
            );

            if (deviceEmployees.length === 0) return null;

            return (
              <div key={device.id} className="bg-white rounded-lg shadow overflow-hidden">
                {/* Device Header */}
                <div className="px-4 py-3 bg-gradient-to-r from-primary-50 to-white border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></span>
                    <div>
                      <span className="text-sm font-semibold text-gray-900">{device.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{device.ip}:{device.port}</span>
                    </div>
                    <span className="ml-2 px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-medium rounded-full">
                      {deviceEmployees.length} {t('employees').toLowerCase()}
                    </span>
                  </div>
                  <button
                    onClick={() => setFilterDevice(device.id)}
                    className="text-xs text-primary-600 hover:text-primary-800 font-medium transition-colors"
                  >
                    {t('viewDetails')} →
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100">
                    <TableHead />
                    <tbody className="bg-white divide-y divide-gray-100">
                      {deviceEmployees.map(employee => (
                        <tr key={employee.id} className="hover:bg-gray-50 transition-colors">
                          {renderEmployeeRow(employee)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Sticky Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingEmployee ? t('editEmployee') : t('addEmployee')}
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">{editingEmployee ? t('updateEmployeeDetails') || 'Update employee details' : t('fillEmployeeForm') || 'Fill in the employee information below'}</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {/* Basic Information */}
                <div className="bg-gray-50 rounded-lg p-5 border border-gray-100">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2 uppercase tracking-wide">
                    <Users className="w-4 h-4 text-primary-600" />
                    {t('basicInformation')}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        {t('firstName')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.firstName || ''}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        placeholder={t('firstName')}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        {t('lastName')}
                      </label>
                      <input
                        type="text"
                        value={formData.lastName || ''}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        placeholder={t('lastName')}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                      />
                    </div>
                    {/* Preview: combined name as it will appear on device */}
                    {(formData.firstName || formData.lastName) && (
                      <div className="sm:col-span-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
                        <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                        </svg>
                        <span className="text-sm text-blue-700">
                          {t('nameOnDevice') || 'Name on device'}: <strong>{[formData.firstName, formData.lastName].filter(Boolean).join(' ')}</strong>
                        </span>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        {t('userId')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.user_id || ''}
                        onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        {t('deviceUserId')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={formData.device_user_id || ''}
                        onChange={(e) => setFormData({ ...formData, device_user_id: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        {t('cardNumber')}
                      </label>
                      <input
                        type="number"
                        value={formData.card_number || ''}
                        onChange={(e) => setFormData({ ...formData, card_number: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div className="bg-gray-50 rounded-lg p-5 border border-gray-100">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2 uppercase tracking-wide">
                    <Mail className="w-4 h-4 text-primary-600" />
                    {t('contactInformation')}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('email')}</label>
                      <input
                        type="email"
                        value={formData.email || ''}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('phone')}</label>
                      <input
                        type="text"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('address')}</label>
                      <textarea
                        value={formData.address || ''}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                        rows="2"
                      />
                    </div>
                  </div>
                </div>

                {/* Organization */}
                <div className="bg-gray-50 rounded-lg p-5 border border-gray-100">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2 uppercase tracking-wide">
                    <Building2 className="w-4 h-4 text-primary-600" />
                    {t('organization')}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        {t('company')} <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.company_id || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          company_id: e.target.value,
                          department_id: '',
                          position_id: ''
                        })}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                        required
                      >
                        <option value="">{t('selectCompany')}</option>
                        {companies.map(company => (
                          <option key={company.id} value={company.id}>{company.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        {t('department')} <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.department_id || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          department_id: e.target.value,
                          position_id: ''
                        })}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                        required
                        disabled={!formData.company_id}
                      >
                        <option value="">{t('selectDepartment')}</option>
                        {availableDepartments.map(dept => (
                          <option key={dept.id} value={dept.id}>{dept.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('position')}</label>
                      <select
                        value={formData.position_id || ''}
                        onChange={(e) => setFormData({ ...formData, position_id: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                        disabled={!formData.department_id}
                      >
                        <option value="">{t('selectPosition')}</option>
                        {availablePositions.map(pos => (
                          <option key={pos.id} value={pos.id}>{pos.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Additional Details */}
                <div className="bg-gray-50 rounded-lg p-5 border border-gray-100">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2 uppercase tracking-wide">
                    <Calendar className="w-4 h-4 text-primary-600" />
                    {t('additionalDetails')}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('role')}</label>
                      <select
                        value={formData.privilege || 0}
                        onChange={(e) => setFormData({ ...formData, privilege: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                      >
                        <option value="0">{t('user')}</option>
                        <option value="14">{t('admin')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('gender')}</label>
                      <select
                        value={formData.gender || ''}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                      >
                        <option value="">{t('selectGender')}</option>
                        <option value="Male">{t('male')}</option>
                        <option value="Female">{t('female')}</option>
                        <option value="Other">{t('other')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('hireDate')}</label>
                      <input
                        type="date"
                        value={formData.hire_date || ''}
                        onChange={(e) => setFormData({ ...formData, hire_date: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('birthDate')}</label>
                      <input
                        type="date"
                        value={formData.birth_date || ''}
                        onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Work Schedule (Personal Timing — Weekly) */}
                <div className="bg-gray-50 rounded-lg p-5 border border-gray-100">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2 uppercase tracking-wide">
                    <Coffee className="w-4 h-4 text-primary-600" />
                    {t('workSchedule') || 'Work Schedule'}
                  </h4>
                  <p className="text-xs text-gray-500 mb-4">{t('scheduleHint') || 'Set personal work hours per day. Leave empty to use department/shift timing.'}</p>

                  <div className="space-y-2">
                    {scheduleData.map((day, idx) => (
                      <div key={idx} className={`flex flex-wrap items-center gap-2 p-2 rounded-lg border text-sm ${day.is_day_off ? 'bg-gray-100 border-gray-200' : 'bg-white border-gray-200'}`}>
                        <span className="w-16 font-medium text-gray-700 text-xs">{t(DAY_KEYS[idx])}</span>

                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={day.is_day_off}
                            onChange={(e) => {
                              const copy = [...scheduleData];
                              copy[idx] = { ...copy[idx], is_day_off: e.target.checked };
                              setScheduleData(copy);
                            }}
                            className="w-3.5 h-3.5 text-red-600 rounded"
                          />
                          <span className="text-xs text-gray-500">{t('dayOff')}</span>
                        </label>

                        {!day.is_day_off && (
                          <>
                            <input type="time" value={day.work_start || ''} onChange={(e) => { const c = [...scheduleData]; c[idx] = { ...c[idx], work_start: e.target.value }; setScheduleData(c); }} className="px-1.5 py-1 border rounded text-xs w-24" />
                            <span className="text-gray-400 text-xs">-</span>
                            <input type="time" value={day.work_end || ''} onChange={(e) => { const c = [...scheduleData]; c[idx] = { ...c[idx], work_end: e.target.value }; setScheduleData(c); }} className="px-1.5 py-1 border rounded text-xs w-24" />

                            <label className="flex items-center gap-1 cursor-pointer ml-1">
                              <input type="checkbox" checked={day.has_break} onChange={(e) => { const c = [...scheduleData]; c[idx] = { ...c[idx], has_break: e.target.checked, break_start: e.target.checked ? c[idx].break_start : '', break_end: e.target.checked ? c[idx].break_end : '' }; setScheduleData(c); }} className="w-3.5 h-3.5 text-primary-600 rounded" />
                              <span className="text-xs text-gray-500">{t('hasBreak')}</span>
                            </label>

                            {day.has_break && (
                              <>
                                <input type="time" value={day.break_start || ''} onChange={(e) => { const c = [...scheduleData]; c[idx] = { ...c[idx], break_start: e.target.value }; setScheduleData(c); }} className="px-1.5 py-1 border rounded text-xs w-24" />
                                <span className="text-gray-400 text-xs">-</span>
                                <input type="time" value={day.break_end || ''} onChange={(e) => { const c = [...scheduleData]; c[idx] = { ...c[idx], break_end: e.target.value }; setScheduleData(c); }} className="px-1.5 py-1 border rounded text-xs w-24" />
                              </>
                            )}

                            <button type="button" onClick={() => { const src = scheduleData[idx]; setScheduleData(prev => prev.map(d => ({ ...d, is_day_off: src.is_day_off, work_start: src.work_start, work_end: src.work_end, has_break: src.has_break, break_start: src.break_start, break_end: src.break_end }))); }} title={t('copyToAllDays')} className="p-0.5 text-gray-400 hover:text-primary-600"><Copy className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sticky Footer Actions */}
              <div className="flex gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('saving')}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {t('saveEmployee')}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sync Overlay */}
      <SyncOverlay visible={syncOverlay.visible} phase={syncOverlay.phase} deviceName={syncOverlay.deviceName} />

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

export default EmployeeManagement;
