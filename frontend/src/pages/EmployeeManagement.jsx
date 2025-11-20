import { useState, useEffect } from 'react';
import { Users, Plus, Edit, Trash2, X, Save, Loader2, CheckCircle, AlertCircle, Search, Building2, Briefcase, Mail, Phone, Calendar } from 'lucide-react';
import api from '../services/api';

function EmployeeManagement() {
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
      setEmployees(employeesRes.employees || []);
    } catch (error) {
      console.error('Failed to load employees:', error);
      showNotification('error', 'Failed to load employees: ' + error.message);
    }
  };

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
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

  const handleDelete = async (id) => {
    if (!deleteConfirm) {
      const employee = employees.find(e => e.id === id);
      setDeleteConfirm({ 
        id, 
        name: employee?.name || 'this employee',
        info: `${employee?.user_id || ''} - ${employee?.department_name || 'No department'}`
      });
      return;
    }

    setSaving(true);
    try {
      await api.deleteEmployee(id);
      await loadData();
      showNotification('success', 'Employee deleted successfully!');
    } catch (error) {
      console.error('Failed to delete:', error);
      showNotification('error', error.message);
    } finally {
      setSaving(false);
      setDeleteConfirm(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.name || !formData.user_id || !formData.device_user_id) {
      showNotification('error', 'Please fill in all required fields');
      return;
    }

    if (!formData.company_id || !formData.department_id) {
      showNotification('error', 'Please select company and department');
      return;
    }

    setSaving(true);
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
        showNotification('success', 'Employee updated successfully!');
      } else {
        await api.createEmployee(employeeData);
        showNotification('success', 'Employee created successfully!');
      }
      
      setShowModal(false);
      await loadData();
    } catch (error) {
      console.error('Failed to save:', error);
      // Check if there are sync warnings in the response
      if (error.message.includes('sync_warnings')) {
        showNotification('warning', 'Employee saved but some devices may not be synced. Changes will sync on next device connection.');
      } else {
        showNotification('error', error.message);
      }
    } finally {
      setSaving(false);
    }
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employee Management</h1>
          <p className="text-sm text-gray-500 mt-1">Manage employee information and assignments</p>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Employee
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Search className="w-4 h-4 inline mr-1" />
              Search
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, ID, or email..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Building2 className="w-4 h-4 inline mr-1" />
              Filter by Company
            </label>
            <select
              value={filterCompany}
              onChange={(e) => {
                setFilterCompany(e.target.value);
                setFilterDepartment('');
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">All Companies</option>
              {companies.map(company => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Users className="w-4 h-4 inline mr-1" />
              Filter by Department
            </label>
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">All Departments</option>
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
              Filter by Device
            </label>
            <select
              value={filterDevice}
              onChange={(e) => setFilterDevice(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">All Devices</option>
              {devices.map(device => (
                <option key={device.id} value={device.id}>{device.name}</option>
              ))}
            </select>
          </div>
        </div>
        
        {(searchTerm || filterCompany || filterDepartment || filterDevice) && (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-gray-600">
              Showing {filteredEmployees.length} of {employees.length} employees
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
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Employee Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" />
            <p className="text-gray-500 mt-4">Loading employees...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg mb-2">
              {searchTerm || filterCompany || filterDepartment ? 'No employees found' : 'No employees yet'}
            </p>
            <p className="text-gray-400 text-sm">
              {searchTerm || filterCompany || filterDepartment 
                ? 'Try adjusting your filters' 
                : 'Click "Add Employee" to create your first employee'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Company
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Device
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
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
                        onClick={() => handleDelete(employee.id)}
                        disabled={saving}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50"
                        title="Delete employee"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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
                {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
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
                    Basic Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name <span className="text-red-500">*</span>
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
                        User ID <span className="text-red-500">*</span>
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
                        Device User ID <span className="text-red-500">*</span>
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
                        Card Number
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
                    Contact Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={formData.email || ''}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <input
                        type="text"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
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
                    Organization
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Company <span className="text-red-500">*</span>
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
                        <option value="">Select Company</option>
                        {companies.map(company => (
                          <option key={company.id} value={company.id}>{company.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Department <span className="text-red-500">*</span>
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
                        <option value="">Select Department</option>
                        {availableDepartments.map(dept => (
                          <option key={dept.id} value={dept.id}>{dept.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
                      <select
                        value={formData.position_id || ''}
                        onChange={(e) => setFormData({ ...formData, position_id: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        disabled={!formData.department_id}
                      >
                        <option value="">Select Position</option>
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
                    Additional Details
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                      <select
                        value={formData.privilege || 0}
                        onChange={(e) => setFormData({ ...formData, privilege: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        <option value="0">User</option>
                        <option value="14">Admin</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                      <select
                        value={formData.gender || ''}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        <option value="">Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Hire Date</label>
                      <input
                        type="date"
                        value={formData.hire_date || ''}
                        onChange={(e) => setFormData({ ...formData, hire_date: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Birth Date</label>
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
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Employee
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full transform transition-all animate-slideUp">
            <div className="flex items-center gap-4 p-6 bg-red-50 border-b border-red-100 rounded-t-xl">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Delete Employee</h3>
                <p className="text-sm text-gray-600 mt-0.5">This action cannot be undone</p>
              </div>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-gray-700">
                Are you sure you want to delete employee{' '}
                <span className="font-semibold text-red-600">{deleteConfirm.name}</span>?
              </p>
              <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                {deleteConfirm.info}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(deleteConfirm.id)}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmployeeManagement;
