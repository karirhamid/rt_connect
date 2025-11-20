import { useState, useEffect } from 'react';
import { Clock, Users, Save, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../services/api';
import Dialog, { Toast } from '../components/Dialog';

function BulkShiftAssignment() {
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [formData, setFormData] = useState({
    shift_id: '',
    effective_from: new Date().toISOString().split('T')[0],
    effective_to: '',
    notes: ''
  });
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialog, setDialog] = useState({ isOpen: false, type: '', title: '', message: '', onConfirm: null });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [employeesRes, shiftsRes] = await Promise.all([
        api.getEmployees(),
        api.getShifts({ is_active: true })
      ]);
      setEmployees(employeesRes.employees || []);
      setShifts(shiftsRes || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEmployee = (employeeId) => {
    setSelectedEmployees(prev =>
      prev.includes(employeeId)
        ? prev.filter(id => id !== employeeId)
        : [...prev, employeeId]
    );
  };

  const handleSelectAll = () => {
    if (selectedEmployees.length === filteredEmployees.length) {
      setSelectedEmployees([]);
    } else {
      setSelectedEmployees(filteredEmployees.map(e => e.id));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (selectedEmployees.length === 0) {
      setDialog({
        isOpen: true,
        type: 'warning',
        title: 'No Employees Selected',
        message: 'Please select at least one employee to assign shifts.',
        onConfirm: null
      });
      return;
    }

    if (!formData.shift_id) {
      setDialog({
        isOpen: true,
        type: 'warning',
        title: 'No Shift Selected',
        message: 'Please select a shift to assign to the selected employees.',
        onConfirm: null
      });
      return;
    }

    const selectedShift = shifts.find(s => s.id === parseInt(formData.shift_id));
    
    setDialog({
      isOpen: true,
      type: 'confirm',
      title: 'Bulk Assign Shifts',
      message: `Are you sure you want to assign shift "${selectedShift?.name || 'Unknown'}" to ${selectedEmployees.length} employee(s)?`,
      confirmText: 'Assign Shifts',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setDialog({ ...dialog, loading: true });
        setResult(null);

        try {
          const bulkData = {
            employee_ids: selectedEmployees,
            shift_id: parseInt(formData.shift_id),
            effective_from: formData.effective_from,
            effective_to: formData.effective_to || null,
            notes: formData.notes
          };

          const response = await api.bulkAssignShifts(bulkData);
          setDialog({ isOpen: false });
          setResult(response);
          
          if (response.successful > 0) {
            showToast(`Successfully assigned shifts to ${response.successful} employee(s)!`, 'success');
            setSelectedEmployees([]);
            setFormData({
              shift_id: '',
              effective_from: new Date().toISOString().split('T')[0],
              effective_to: '',
              notes: ''
            });
          }
          
          if (response.failed > 0) {
            showToast(`${response.failed} assignment(s) failed. Check the results below.`, 'warning');
          }
        } catch (error) {
          setDialog({
            isOpen: true,
            type: 'error',
            title: 'Assignment Failed',
            message: `Failed to assign shifts: ${error.message}`,
            onConfirm: null
          });
          setResult({
            total: selectedEmployees.length,
            successful: 0,
            failed: selectedEmployees.length,
            results: {
              success: [],
              failed: selectedEmployees.map(id => ({
                employee_id: id,
                error: error.message
              }))
            }
          });
        }
      }
    });
  };

  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.user_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedShift = shifts.find(s => s.id === parseInt(formData.shift_id));

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-gray-200 rounded animate-pulse"></div>
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="h-[400px] bg-gray-100 rounded animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bulk Shift Assignment</h1>
        <p className="text-gray-600 mt-1">Assign the same shift to multiple employees</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Employee Selection */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-md">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Select Employees ({selectedEmployees.length} selected)
                </h2>
                <button
                  onClick={handleSelectAll}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  {selectedEmployees.length === filteredEmployees.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {/* Search */}
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search employees..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* Employee List */}
            <div className="max-h-[500px] overflow-y-auto">
              {filteredEmployees.length === 0 ? (
                <div className="p-12 text-center">
                  <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">No employees found</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {filteredEmployees.map(employee => (
                    <label
                      key={employee.id}
                      className="flex items-center p-4 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEmployees.includes(employee.id)}
                        onChange={() => handleToggleEmployee(employee.id)}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <div className="ml-4 flex-1">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 h-10 w-10 bg-primary-100 rounded-full flex items-center justify-center">
                            <span className="text-primary-700 font-semibold text-sm">
                              {employee.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </span>
                          </div>
                          <div>
                            <h3 className="font-medium text-gray-900">{employee.name}</h3>
                            <p className="text-sm text-gray-600">
                              ID: {employee.user_id}
                              {employee.department && ` • ${employee.department.name}`}
                            </p>
                          </div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Assignment Form */}
        <div>
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6 space-y-6 sticky top-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Shift Details</h2>

              {/* Shift Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Shift *
                </label>
                <select
                  value={formData.shift_id}
                  onChange={(e) => setFormData({ ...formData, shift_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                >
                  <option value="">Choose shift...</option>
                  {shifts.map(shift => (
                    <option key={shift.id} value={shift.id}>
                      {shift.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Shift Preview */}
              {selectedShift && (
                <div
                  className="p-4 rounded-lg mb-4"
                  style={{ backgroundColor: selectedShift.color + '20' }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Clock className="w-5 h-5" style={{ color: selectedShift.color }} />
                    <span className="font-medium text-gray-900">{selectedShift.name}</span>
                  </div>
                  <p className="text-sm text-gray-600">{selectedShift.shift_type}</p>
                </div>
              )}

              {/* Effective From */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Effective From *
                </label>
                <input
                  type="date"
                  value={formData.effective_from}
                  onChange={(e) => setFormData({ ...formData, effective_from: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Effective To */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Effective To (Optional)
                </label>
                <input
                  type="date"
                  value={formData.effective_to}
                  onChange={(e) => setFormData({ ...formData, effective_to: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">Leave empty for ongoing assignment</p>
              </div>

              {/* Notes */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  rows="3"
                  placeholder="Optional notes..."
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={processing || selectedEmployees.length === 0 || !formData.shift_id}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Assign to {selectedEmployees.length} Employee{selectedEmployees.length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Results */}
          {result && (
            <div className="mt-6 bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Assignment Results</h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="font-medium text-green-900">Successful</span>
                  </div>
                  <span className="font-bold text-green-600">{result.successful}</span>
                </div>

                {result.failed > 0 && (
                  <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                      <span className="font-medium text-red-900">Failed</span>
                    </div>
                    <span className="font-bold text-red-600">{result.failed}</span>
                  </div>
                )}
              </div>

              {result.results.failed.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Errors:</h4>
                  <div className="space-y-1">
                    {result.results.failed.map((failure, index) => (
                      <p key={index} className="text-xs text-red-600">
                        Employee ID {failure.employee_id}: {failure.error}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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

export default BulkShiftAssignment;
