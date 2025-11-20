import { useState, useEffect } from 'react';
import { Users, Plus, Edit, Trash2, X, Save, Loader2, CheckCircle, AlertCircle, Search, Building2, Briefcase, Mail, Phone, Calendar, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import Dialog, { Toast } from '../components/Dialog';

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
      
      // Fetch employees with filters
      await loadEmployees();
    } catch (error) {
      console.error('Failed to load data:', error);
      showNotification('error', 'Failed to load data: ' + error.message);
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
      
      // Load current shifts for all employees
      const shiftsMap = {};
      await Promise.all(
        employeesList.map(async (emp) => {
          try {
            const shift = await api.getEmployeeCurrentShift(emp.id);
            if (shift) {
              shiftsMap[emp.id] = shift;
            }
          } catch (error) {
            // Employee may not have a shift assigned
            console.debug(`No shift for employee ${emp.id}`);
          }
        })
      );
      setEmployeeShifts(shiftsMap);
    } catch (error) {
      console.error('Failed to load employees:', error);
      showNotification('error', 'Failed to load employees: ' + error.message);
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

  const handleAdd = () => {
    setEditingEmployee(null);
    setFormData({
      device_user_id: '',
      user_id: '',
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
    setShowModal(true);
  };

  const handleEdit = (employee) => {
    setEditingEmployee(employee);
    setFormData({
      device_user_id: employee.device_user_id || '',
      user_id: employee.user_id || '',
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
    setShowModal(true);
  };

  const handleDelete = (employee) => {
    setDialog({
      isOpen: true,
      type: 'warning',
      title: 'Delete Employee',
      message: `Are you sure you want to delete employee "${employee.name}" (${employee.user_id})? This will permanently remove all their data including attendance records. This action cannot be undone.`,
      confirmText: 'Delete Employee',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setDialog({ ...dialog, loading: true });
        try {
          await api.deleteEmployee(employee.id);
          setDialog({ isOpen: false });
          showToast('Employee deleted successfully!', 'success');
          await loadData();
        } catch (error) {
          setDialog({
            isOpen: true,
            type: 'error',
            title: 'Delete Failed',
            message: `Failed to delete employee: ${error.message}`,
            onConfirm: null
          });
        }
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.name || !formData.user_id || !formData.device_user_id) {
      setDialog({
        isOpen: true,
        type: 'warning',
        title: 'Missing Information',
        message: 'Please fill in all required fields: Name, User ID, and Device User ID.',
        onConfirm: null
      });
      return;
    }

    if (!formData.company_id || !formData.department_id) {
      setDialog({
        isOpen: true,
        type: 'warning',
        title: 'Missing Information',
        message: 'Please select both company and department.',
        onConfirm: null
      });
      return;
    }

    const action = editingEmployee ? 'update' : 'add';
    const actionText = editingEmployee ? 'Update' : 'Add';

    setDialog({
      isOpen: true,
      type: 'confirm',
      title: `${actionText} Employee`,
      message: `Are you sure you want to ${action} employee "${formData.name}" (${formData.user_id})?`,
      confirmText: `${actionText} Employee`,
      cancelText: 'Cancel',
      onConfirm: async () => {
        setDialog({ ...dialog, loading: true });
        try {
          const employeeData = {
            ...formData,
            device_user_id: parseInt(formData.device_user_id),
            company_id: parseInt(formData.company_id),
            department_id: parseInt(formData.department_id),
            position_id: formData.position_id ? parseInt(formData.position_id) : null,
            privilege: parseInt(formData.privilege || 0),
            card_number: formData.card_number ? parseInt(formData.card_number) : null,
            hire_date: formData.hire_date || null,
            birth_date: formData.birth_date || null
          };

          if (editingEmployee) {
            await api.updateEmployee(editingEmployee.id, employeeData);
            showToast('Employee updated successfully!', 'success');
          } else {
            await api.createEmployee(employeeData);
            showToast('Employee created successfully!', 'success');
          }
          
          setDialog({ isOpen: false });
          setShowModal(false);
          await loadData();
        } catch (error) {
          setDialog({
            isOpen: true,
            type: 'error',
            title: 'Operation Failed',
            message: error.message.includes('sync_warnings') 
              ? 'Employee saved but some devices may not be synced. Changes will sync on next device connection.'
              : `Failed to ${action} employee: ${error.message}`,
            onConfirm: null
          });
        }
      }
    });
  };

  // Filter employees
  const filteredEmployees = employees.filter(employee => {
    const matchesSearch = !searchTerm || 
      employee.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.user_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCompany = !filterCompany || employee.company_id === parseInt(filterCompany);
    const matchesDepartment = !filterDepartment || employee.department_id === parseInt(filterDepartment);
    
    return matchesSearch && matchesCompany && matchesDepartment;
  });

  // Get departments for selected company in form
  const availableDepartments = formData.company_id 
    ? departments.filter(d => d.company_id === parseInt(formData.company_id))
    : departments;

  // Get positions for selected department in form
  const availablePositions = formData.department_id
    ? positions.filter(p => p.department_id === parseInt(formData.department_id))
    : positions;

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
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          {t('addEmployee')}
        </button>
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
              {t('showing')} {filteredEmployees.length} {t('of')} {employees.length} {t('employees').toLowerCase()}
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
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="overflow-x-auto">
            <div className="min-w-full">
              <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                <div className="grid grid-cols-8 gap-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={i} className="h-4 bg-gray-200 rounded animate-pulse"></div>
                  ))}
                </div>
              </div>
              <div className="divide-y divide-gray-200">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="px-6 py-4">
                    <div className="grid grid-cols-8 gap-4">
                      <div className="col-span-2 h-10 bg-gray-200 rounded animate-pulse"></div>
                      <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
                      <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
                      <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
                      <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
                      <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
                      <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-12 text-center">
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
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('employee')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('contact')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('company')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('department')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('position')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('currentShift')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('device')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('role')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredEmployees.map(employee => (
                  <tr key={employee.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-primary-100 rounded-full flex items-center justify-center">
                          <span className="text-primary-700 font-semibold">
                            {employee.name?.charAt(0)?.toUpperCase() || 'U'}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                          <div className="text-xs text-gray-500">ID: {employee.user_id}</div>
                          {employee.card_number && (
                            <div className="text-xs text-gray-400">Card: {employee.card_number}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {employee.email && (
                        <div className="text-sm text-gray-900 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {employee.email}
                        </div>
                      )}
                      {employee.phone && (
                        <div className="text-sm text-gray-500 flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {employee.phone}
                        </div>
                      )}
                      {!employee.email && !employee.phone && (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {employee.company_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {employee.department_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {employee.position_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {employeeShifts[employee.id] ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: employeeShifts[employee.id].shift.color }}
                          />
                          <span className="text-gray-900 font-medium">
                            {employeeShifts[employee.id].shift.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          No Shift
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {employee.source_device_name ? (
                        <span className="text-gray-900 flex items-center">
                          <svg className="w-4 h-4 mr-1 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                          </svg>
                          {employee.source_device_name}
                        </span>
                      ) : (
                        <span className="text-gray-400">Manual</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        employee.privilege === 14 
                          ? 'bg-purple-100 text-purple-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {employee.privilege === 14 ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEdit(employee)}
                        disabled={saving}
                        className="text-primary-600 hover:text-primary-900 mr-4 disabled:opacity-50"
                        title="Edit employee"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(employee)}
                        disabled={saving}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50"
                        title="Delete employee"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full my-8">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingEmployee ? t('editEmployee') : t('addEmployee')}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              <div className="space-y-6">
                {/* Basic Information */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary-600" />
                    {t('basicInformation')}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('fullName')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('userId')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.user_id || ''}
                        onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('deviceUserId')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={formData.device_user_id || ''}
                        onChange={(e) => setFormData({ ...formData, device_user_id: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('cardNumber')}
                      </label>
                      <input
                        type="number"
                        value={formData.card_number || ''}
                        onChange={(e) => setFormData({ ...formData, card_number: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Mail className="w-5 h-5 text-primary-600" />
                    {t('contactInformation')}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('email')}</label>
                      <input
                        type="email"
                        value={formData.email || ''}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('phone')}</label>
                      <input
                        type="text"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('address')}</label>
                      <textarea
                        value={formData.address || ''}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        rows="2"
                      />
                    </div>
                  </div>
                </div>

                {/* Organization */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-primary-600" />
                    {t('organization')}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        required
                      >
                        <option value="">{t('selectCompany')}</option>
                        {companies.map(company => (
                          <option key={company.id} value={company.id}>{company.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('department')} <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.department_id || ''}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          department_id: e.target.value,
                          position_id: ''
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('position')}</label>
                      <select
                        value={formData.position_id || ''}
                        onChange={(e) => setFormData({ ...formData, position_id: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary-600" />
                    {t('additionalDetails')}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('role')}</label>
                      <select
                        value={formData.privilege || 0}
                        onChange={(e) => setFormData({ ...formData, privilege: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        <option value="0">{t('user')}</option>
                        <option value="14">{t('admin')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('gender')}</label>
                      <select
                        value={formData.gender || ''}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        <option value="">{t('selectGender')}</option>
                        <option value="Male">{t('male')}</option>
                        <option value="Female">{t('female')}</option>
                        <option value="Other">{t('other')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('hireDate')}</label>
                      <input
                        type="date"
                        value={formData.hire_date || ''}
                        onChange={(e) => setFormData({ ...formData, hire_date: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('birthDate')}</label>
                      <input
                        type="date"
                        value={formData.birth_date || ''}
                        onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
