import { useState, useEffect } from 'react';
import { Building2, Users, Briefcase, Plus, Edit, Trash2, X, Save, Loader2, CheckCircle, AlertCircle, ChevronRight, ChevronDown } from 'lucide-react';
import api from '../services/api';

function CompanyConfig() {
  const [activeTab, setActiveTab] = useState('company');
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);
  const [hierarchyData, setHierarchyData] = useState([]);
  const [expandedCompanies, setExpandedCompanies] = useState(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const tabs = [
    { id: 'company', name: 'Company Info', icon: Building2 },
    { id: 'department', name: 'Departments', icon: Users },
    { id: 'position', name: 'Positions', icon: Briefcase },
  ];

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    fetchData();
    if (activeTab === 'company') {
      fetchHierarchyData();
    }
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'company') {
        const data = await api.getCompanies();
        setCompanies(data.companies || []);
      } else if (activeTab === 'department') {
        const data = await api.getDepartments();
        setDepartments(data.departments || []);
      } else if (activeTab === 'position') {
        const data = await api.getPositions();
        setPositions(data.positions || []);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      showNotification('error', 'Failed to load data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchHierarchyData = async () => {
    try {
      const [companiesRes, departmentsRes] = await Promise.all([
        api.getCompanies(),
        api.getDepartments()
      ]);
      
      const companiesList = companiesRes.companies || [];
      const departmentsList = departmentsRes.departments || [];
      
      // Build recursive hierarchy helper
      const buildDeptTree = (parentId, allDepts) => {
        return allDepts
          .filter(d => d.parent_id === parentId)
          .map(dept => ({
            ...dept,
            children: buildDeptTree(dept.id, allDepts)
          }));
      };
      
      // Build hierarchy: companies with their top-level departments (and nested children)
      const hierarchy = companiesList.map(company => {
        const topLevelDepts = departmentsList.filter(dept => 
          dept.company_id === company.id && !dept.parent_id
        );
        
        return {
          ...company,
          departments: topLevelDepts.map(dept => ({
            ...dept,
            children: buildDeptTree(dept.id, departmentsList)
          }))
        };
      });
      
      setHierarchyData(hierarchy);
    } catch (error) {
      console.error('Failed to fetch hierarchy:', error);
    }
  };

  const toggleCompany = (companyId) => {
    const newExpanded = new Set(expandedCompanies);
    if (newExpanded.has(companyId)) {
      newExpanded.delete(companyId);
    } else {
      newExpanded.add(companyId);
    }
    setExpandedCompanies(newExpanded);
  };

  const handleAdd = () => {
    setEditingItem(null);
    setFormData({});
    setShowModal(true);
    // Load companies for department form
    if (activeTab === 'department' && companies.length === 0) {
      api.getCompanies().then(data => setCompanies(data.companies || []));
    }
    // Load departments for position form
    if (activeTab === 'position' && departments.length === 0) {
      api.getDepartments().then(data => setDepartments(data.departments || []));
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData(item);
    setShowModal(true);
    // Load companies for department form
    if (activeTab === 'department' && companies.length === 0) {
      api.getCompanies().then(data => setCompanies(data.companies || []));
    }
    // Load departments for position form
    if (activeTab === 'position' && departments.length === 0) {
      api.getDepartments().then(data => setDepartments(data.departments || []));
    }
  };

  const handleDelete = async (id) => {
    if (!deleteConfirm) {
      // Show confirmation modal
      let itemName = '';
      let itemType = '';
      let warningMessage = '';
      
      if (activeTab === 'company') {
        const company = companies.find(c => c.id === id);
        itemName = company?.name || 'this company';
        itemType = 'company';
        const deptCount = departments.filter(d => d.company_id === id).length;
        if (deptCount > 0) {
          warningMessage = `This company has ${deptCount} department${deptCount !== 1 ? 's' : ''}. All departments and their data will also be deleted.`;
        }
      } else if (activeTab === 'department') {
        const dept = departments.find(d => d.id === id);
        itemName = dept?.name || 'this department';
        itemType = 'department';
        const childCount = departments.filter(d => d.parent_id === id).length;
        if (childCount > 0) {
          warningMessage = `This department has ${childCount} sub-department${childCount !== 1 ? 's' : ''}. All sub-departments will also be deleted.`;
        }
      } else if (activeTab === 'position') {
        const position = positions.find(p => p.id === id);
        itemName = position?.name || 'this position';
        itemType = 'position';
      }
      
      setDeleteConfirm({ id, name: itemName, type: itemType, warning: warningMessage });
      return;
    }
    
    setSaving(true);
    try {
      if (activeTab === 'company') {
        await api.deleteCompany(id);
      } else if (activeTab === 'department') {
        await api.deleteDepartment(id);
      } else if (activeTab === 'position') {
        await api.deletePosition(id);
      }
      await fetchData();
      if (activeTab === 'company') {
        await fetchHierarchyData();
      }
      showNotification('success', 'Item deleted successfully!');
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
    
    setSaving(true);
    try {
      if (activeTab === 'company') {
        if (editingItem) {
          await api.updateCompany(editingItem.id, formData);
          showNotification('success', 'Company updated successfully!');
        } else {
          await api.createCompany(formData);
          showNotification('success', 'Company created successfully!');
        }
      } else if (activeTab === 'department') {
        if (editingItem) {
          await api.updateDepartment(editingItem.id, formData);
          showNotification('success', 'Department updated successfully!');
        } else {
          await api.createDepartment(formData);
          showNotification('success', 'Department created successfully!');
        }
      } else if (activeTab === 'position') {
        // Convert department_id to array for API
        const positionData = {
          ...formData,
          department_ids: formData.department_id ? [parseInt(formData.department_id)] : []
        };
        if (editingItem) {
          await api.updatePosition(editingItem.id, positionData);
          showNotification('success', 'Position updated successfully!');
        } else {
          await api.createPosition(positionData);
          showNotification('success', 'Position created successfully!');
        }
      }
      setShowModal(false);
      await fetchData();
      if (activeTab === 'company') {
        await fetchHierarchyData();
      }
    } catch (error) {
      console.error('Failed to save:', error);
      showNotification('error', error.message);
    } finally {
      setSaving(false);
    }
  };

  const renderCompanyForm = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
        <input
          type="text"
          value={formData.name || ''}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
        <input
          type="text"
          value={formData.address || ''}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
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
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input
          type="email"
          value={formData.email || ''}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>
    </div>
  );

  const renderDepartmentForm = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
        <select
          value={formData.company_id || ''}
          onChange={(e) => setFormData({ ...formData, company_id: parseInt(e.target.value) })}
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Department Name</label>
        <input
          type="text"
          value={formData.name || ''}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Parent Department (Optional)</label>
        <select
          value={formData.parent_id || ''}
          onChange={(e) => setFormData({ ...formData, parent_id: e.target.value ? parseInt(e.target.value) : null })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        >
          <option value="">None (Top Level)</option>
          {departments.filter(d => d.company_id === parseInt(formData.company_id) && d.id !== editingItem?.id).map(dept => (
            <option key={dept.id} value={dept.id}>{dept.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          rows="3"
        />
      </div>
    </div>
  );

  const renderPositionForm = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Position Name</label>
        <input
          type="text"
          value={formData.name || ''}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
        <select
          value={formData.department_id || ''}
          onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        >
          <option value="">Select Department</option>
          {departments.map(dept => (
            <option key={dept.id} value={dept.id}>{dept.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          rows="3"
        />
      </div>
    </div>
  );

  const renderDepartmentHierarchy = () => {
    // Build hierarchy tree
    const buildTree = (parentId = null) => {
      return departments
        .filter(d => d.parent_id === parentId)
        .sort((a, b) => a.name.localeCompare(b.name));
    };

    const renderDeptNode = (dept, level = 0) => {
      const children = buildTree(dept.id);
      const isExpanded = expandedCompanies.has(`dept-${dept.id}`);
      const hasChildren = children.length > 0;

      return (
        <div key={dept.id} className="border-b border-gray-100 last:border-b-0">
          <div 
            className={`flex items-center gap-3 py-3 px-4 hover:bg-gray-50 transition-colors ${
              level > 0 ? 'bg-gray-50/50' : ''
            }`}
            style={{ paddingLeft: `${(level * 2) + 1}rem` }}
          >
            {/* Expand/Collapse Button */}
            {hasChildren ? (
              <button
                onClick={() => toggleCompany(`dept-${dept.id}`)}
                className="p-1 hover:bg-gray-200 rounded transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-600" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                )}
              </button>
            ) : (
              <div className="w-6"></div>
            )}

            {/* Department Icon */}
            <Users className={`w-5 h-5 flex-shrink-0 ${level === 0 ? 'text-blue-600' : 'text-blue-400'}`} />

            {/* Department Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{dept.name}</span>
                {hasChildren && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    {children.length} sub-dept{children.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-gray-500">{dept.company_name}</span>
                {dept.parent_name && (
                  <span className="text-xs text-gray-400">
                    Parent: {dept.parent_name}
                  </span>
                )}
              </div>
              {dept.description && (
                <p className="text-sm text-gray-600 mt-1">{dept.description}</p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditingItem(null);
                  setFormData({ 
                    company_id: dept.company_id,
                    parent_id: dept.id 
                  });
                  setShowModal(true);
                  if (companies.length === 0) {
                    api.getCompanies().then(data => setCompanies(data.companies || []));
                  }
                }}
                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                title="Add child department"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleEdit(dept)}
                disabled={saving}
                className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50"
                title="Edit department"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(dept.id)}
                disabled={saving}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                title="Delete department"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Render children */}
          {isExpanded && hasChildren && (
            <div className="bg-gradient-to-r from-blue-50/30 to-transparent">
              {children.map(child => renderDeptNode(child, level + 1))}
            </div>
          )}
        </div>
      );
    };

    const topLevelDepts = buildTree(null);

    if (topLevelDepts.length === 0) {
      return (
        <div className="text-center py-16">
          <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg mb-2">No departments yet</p>
          <p className="text-gray-400 text-sm">Click "Add New" to create your first department</p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-gray-200">
        {topLevelDepts.map(dept => renderDeptNode(dept))}
      </div>
    );
  };

  const renderTable = () => {
    let data = [];
    let columns = [];

    if (activeTab === 'company') {
      data = companies;
      columns = ['Name', 'Address', 'Phone', 'Email'];
    } else if (activeTab === 'department') {
      // For departments, use hierarchical view instead
      return renderDepartmentHierarchy();
    } else if (activeTab === 'position') {
      data = positions;
      columns = ['Name', 'Department', 'Description'];
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map(col => (
                <th key={col} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {col}
                </th>
              ))}
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map(item => (
              <tr key={item.id} className="hover:bg-gray-50">
                {activeTab === 'company' && (
                  <>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.address}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.phone}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.email}</td>
                  </>
                )}
                {activeTab === 'department' && (
                  <>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.email}</td>
                  </>
                )}
                {activeTab === 'position' && (
                  <>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.department_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{item.description}</td>
                  </>
                )}
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => handleEdit(item)}
                    disabled={saving}
                    className="text-primary-600 hover:text-primary-900 mr-4 disabled:opacity-50"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={saving}
                    className="text-red-600 hover:text-red-900 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

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
        <h1 className="text-2xl font-bold text-gray-900">Company Configuration</h1>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add New
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-5 h-5" />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'company' ? (
        <div className="flex gap-6">
          {/* Hierarchy Sidebar */}
          <div className="w-80 bg-white rounded-lg shadow border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary-600" />
                Organization Hierarchy
              </h3>
            </div>
            <div className="p-4 max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-2">
                      <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
                      <div className="ml-6 h-8 bg-gray-100 rounded animate-pulse"></div>
                    </div>
                  ))}
                </div>
              ) : hierarchyData.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Building2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No companies yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {hierarchyData.map((company) => {
                    // Recursive component to render department tree
                    const renderDeptNode = (dept, level = 0) => {
                      const hasChildren = dept.children && dept.children.length > 0;
                      const isExpanded = expandedCompanies.has(`dept-${dept.id}`);
                      
                      return (
                        <div key={dept.id} className="space-y-1">
                          <div
                            className={`flex items-center gap-2 p-2 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer ${level > 0 ? 'ml-' + (level * 4) : ''}`}
                            onClick={() => hasChildren && toggleCompany(`dept-${dept.id}`)}
                          >
                            {hasChildren ? (
                              isExpanded ? (
                                <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                              ) : (
                                <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                              )
                            ) : (
                              <div className="w-3 h-3 flex-shrink-0"></div>
                            )}
                            <Users className={`w-4 h-4 text-blue-600 flex-shrink-0 ${level > 0 ? 'opacity-75' : ''}`} />
                            <div className="flex-1 min-w-0">
                              <div className={`text-sm font-medium text-gray-800 truncate ${level > 0 ? 'text-xs' : ''}`}>
                                {dept.name}
                              </div>
                              {dept.description && level === 0 && (
                                <div className="text-xs text-gray-500 truncate">{dept.description}</div>
                              )}
                              {hasChildren && (
                                <div className="text-xs text-gray-400">
                                  {dept.children.length} sub-dept{dept.children.length !== 1 ? 's' : ''}
                                </div>
                              )}
                            </div>
                          </div>
                          {hasChildren && isExpanded && (
                            <div className="ml-4 border-l-2 border-gray-200 pl-2">
                              {dept.children.map(child => renderDeptNode(child, level + 1))}
                            </div>
                          )}
                        </div>
                      );
                    };
                    
                    return (
                      <div key={company.id} className="space-y-1">
                        {/* Company Node */}
                        <div
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer group transition-colors"
                          onClick={() => toggleCompany(company.id)}
                        >
                          {company.departments && company.departments.length > 0 ? (
                            expandedCompanies.has(company.id) ? (
                              <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            )
                          ) : (
                            <div className="w-4 h-4 flex-shrink-0"></div>
                          )}
                          <Building2 className="w-5 h-5 text-primary-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">{company.name}</div>
                            <div className="text-xs text-gray-500">
                              {company.departments?.length || 0} department{company.departments?.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>
                        
                        {/* Department Nodes */}
                        {expandedCompanies.has(company.id) && company.departments && company.departments.length > 0 && (
                          <div className="ml-6 space-y-1 border-l-2 border-gray-200 pl-4">
                            {company.departments.map(dept => renderDeptNode(dept))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Main Content Table */}
          <div className="flex-1 bg-white rounded-lg shadow">
            {loading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-16 bg-gray-200 rounded animate-pulse"></div>
                ))}
              </div>
            ) : (
              renderTable()
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow">
          {loading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 bg-gray-200 rounded animate-pulse"></div>
              ))}
            </div>
          ) : (
            renderTable()
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingItem ? 'Edit' : 'Add'} {tabs.find(t => t.id === activeTab)?.name}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              {activeTab === 'company' && renderCompanyForm()}
              {activeTab === 'department' && renderDepartmentForm()}
              {activeTab === 'position' && renderPositionForm()}
              <div className="flex gap-3 mt-6">
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
                      Save
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
            {/* Header */}
            <div className="flex items-center gap-4 p-6 bg-red-50 border-b border-red-100 rounded-t-xl">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Confirm Deletion</h3>
                <p className="text-sm text-gray-600 mt-0.5">This action cannot be undone</p>
              </div>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <p className="text-gray-700">
                  Are you sure you want to delete{' '}
                  <span className="font-semibold text-gray-900">{deleteConfirm.type}</span>{' '}
                  "<span className="font-semibold text-red-600">{deleteConfirm.name}</span>"?
                </p>
                
                {deleteConfirm.warning && (
                  <div className="flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800">
                      <p className="font-medium mb-1">Warning!</p>
                      <p>{deleteConfirm.warning}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(deleteConfirm.id)}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

export default CompanyConfig;
