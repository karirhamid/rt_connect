const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

class ApiService {
  // App Settings
  async getGeneralSettings() {
    const response = await fetch(`${API_BASE_URL}/api/settings/general`);
    if (!response.ok) throw new Error('Failed to fetch general settings');
    return response.json();
  }

  async updateGeneralSettings(payload) {
    const response = await fetch(`${API_BASE_URL}/api/settings/general`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to update general settings');
    }
    return response.json();
  }
  // Device Discovery
  async discoverDevice(ip, port = 4370) {
    const response = await fetch(`${API_BASE_URL}/api/device/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, port }),
    });
    if (!response.ok) throw new Error('Failed to discover device');
    return response.json();
  }

  // Devices Management
  async getDevices() {
    const response = await fetch(`${API_BASE_URL}/api/devices`);
    if (!response.ok) throw new Error('Failed to fetch devices');
    return response.json();
  }

  async addDevice(deviceData) {
    const response = await fetch(`${API_BASE_URL}/api/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deviceData),
    });
    if (!response.ok) throw new Error('Failed to add device');
    return response.json();
  }

  async deleteDevice(deviceId) {
    const response = await fetch(`${API_BASE_URL}/api/devices/${deviceId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete device');
    return response.json();
  }

  async updateDevice(deviceId, deviceData) {
    const response = await fetch(`${API_BASE_URL}/api/devices/${deviceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deviceData),
    });
    if (!response.ok) throw new Error('Failed to update device');
    return response.json();
  }

  // Device Operations
  async getDeviceInfo(deviceId) {
    const response = await fetch(`${API_BASE_URL}/api/device/${deviceId}/info`);
    if (!response.ok) throw new Error('Failed to fetch device info');
    return response.json();
  }

  async getUsers(deviceId) {
    const response = await fetch(`${API_BASE_URL}/api/device/${deviceId}/users`);
    if (!response.ok) throw new Error('Failed to fetch users');
    return response.json();
  }

  async getAttendance(deviceId, params = {}) {
    const queryParams = new URLSearchParams();
    if (params.user_id) queryParams.append('user_id', params.user_id);
    if (params.start_date) queryParams.append('start_date', params.start_date);
    if (params.end_date) queryParams.append('end_date', params.end_date);

    const url = `${API_BASE_URL}/api/device/${deviceId}/attendance?${queryParams}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch attendance');
    return response.json();
  }

  // Dashboard Statistics
  async getStatistics() {
    const response = await fetch(`${API_BASE_URL}/api/statistics`);
    if (!response.ok) throw new Error('Failed to fetch statistics');
    return response.json();
  }

  // Attendance Management
  async getTodayAttendance(targetDate = null) {
    const url = targetDate 
      ? `${API_BASE_URL}/api/attendance/today?target_date=${targetDate}`
      : `${API_BASE_URL}/api/attendance/today`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch today\'s attendance');
    return response.json();
  }

  async getAttendanceFiltered(filters) {
    const params = new URLSearchParams();
    if (filters.startDate) params.append('start_date', filters.startDate);
    if (filters.endDate) params.append('end_date', filters.endDate);
    if (filters.employeeId) params.append('employee_id', filters.employeeId);
    if (filters.employeeName) params.append('employee_name', filters.employeeName);
    if (filters.departmentId) params.append('department_id', filters.departmentId);
    if (filters.companyId) params.append('company_id', filters.companyId);
    if (filters.status && filters.status !== 'all') params.append('status', filters.status);

    const response = await fetch(`${API_BASE_URL}/api/attendance/filter?${params}`);
    if (!response.ok) throw new Error('Failed to filter attendance');
    return response.json();
  }

  async updateAttendance(attendanceId, data) {
    const params = new URLSearchParams();
    if (data.timestamp) params.append('timestamp', data.timestamp);
    if (data.status !== undefined) params.append('status', data.status);
    if (data.punch !== undefined) params.append('punch', data.punch);

    const response = await fetch(`${API_BASE_URL}/api/attendance/${attendanceId}?${params}`, {
      method: 'PUT',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update attendance');
    }
    return response.json();
  }

  async deleteAttendance(attendanceId) {
    const response = await fetch(`${API_BASE_URL}/api/attendance/${attendanceId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to delete attendance');
    }
    return response.json();
  }

  async triggerSync(deviceId = null) {
    const url = deviceId 
      ? `${API_BASE_URL}/api/sync?device_id=${deviceId}`
      : `${API_BASE_URL}/api/sync`;
    const response = await fetch(url, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to trigger sync');
    return response.json();
  }

  // Manual sync operations
  async syncEmployeesFromDevice(deviceId, previewOnly = false) {
    const url = `${API_BASE_URL}/api/devices/${deviceId}/sync-employees${previewOnly ? '?preview_only=true' : ''}`;
    const response = await fetch(url, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to sync employees');
    }
    return response.json();
  }

  async confirmEmployeeSync(deviceId) {
    const response = await fetch(`${API_BASE_URL}/api/devices/${deviceId}/confirm-sync`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to confirm sync');
    }
    return response.json();
  }

  async getDeviceSettings(deviceId) {
    const response = await fetch(`${API_BASE_URL}/api/devices/${deviceId}/settings`);
    if (!response.ok) throw new Error('Failed to fetch device settings');
    return response.json();
  }

  async updateDeviceSettings(deviceId, settings) {
    const response = await fetch(`${API_BASE_URL}/api/devices/${deviceId}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(settings),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update device settings');
    }
    return response.json();
  }

  async syncAttendanceFromDevice(deviceId, days = 30, previewOnly = false) {
    const url = `${API_BASE_URL}/api/devices/${deviceId}/sync-attendance?days=${days}${previewOnly ? '&preview_only=true' : ''}`;
    const response = await fetch(url, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to sync attendance');
    }
    return response.json();
  }

  async confirmAttendanceSync(deviceId, days = 30) {
    const response = await fetch(`${API_BASE_URL}/api/devices/${deviceId}/confirm-attendance-sync?days=${days}`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to confirm attendance sync');
    }
    return response.json();
  }

  // Organization Management - Companies
  async getCompanies() {
    const response = await fetch(`${API_BASE_URL}/api/companies`);
    if (!response.ok) throw new Error('Failed to fetch companies');
    return response.json();
  }

  async createCompany(companyData) {
    const response = await fetch(`${API_BASE_URL}/api/companies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(companyData),
    });
    if (!response.ok) throw new Error('Failed to create company');
    return response.json();
  }

  async updateCompany(companyId, companyData) {
    const response = await fetch(`${API_BASE_URL}/api/companies/${companyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(companyData),
    });
    if (!response.ok) throw new Error('Failed to update company');
    return response.json();
  }

  async deleteCompany(companyId) {
    const response = await fetch(`${API_BASE_URL}/api/companies/${companyId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to delete company');
    }
    return response.json();
  }

  // Organization Management - Departments
  async getDepartments(companyId = null) {
    const url = companyId 
      ? `${API_BASE_URL}/api/departments?company_id=${companyId}`
      : `${API_BASE_URL}/api/departments`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch departments');
    return response.json();
  }

  async createDepartment(departmentData) {
    const response = await fetch(`${API_BASE_URL}/api/departments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(departmentData),
    });
    if (!response.ok) throw new Error('Failed to create department');
    return response.json();
  }

  async updateDepartment(departmentId, departmentData) {
    const response = await fetch(`${API_BASE_URL}/api/departments/${departmentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(departmentData),
    });
    if (!response.ok) throw new Error('Failed to update department');
    return response.json();
  }

  async deleteDepartment(departmentId) {
    const response = await fetch(`${API_BASE_URL}/api/departments/${departmentId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to delete department');
    }
    return response.json();
  }

  // Organization Management - Positions
  async getPositions(departmentId = null) {
    const url = departmentId 
      ? `${API_BASE_URL}/api/positions?department_id=${departmentId}`
      : `${API_BASE_URL}/api/positions`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch positions');
    return response.json();
  }

  async createPosition(positionData) {
    const response = await fetch(`${API_BASE_URL}/api/positions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(positionData),
    });
    if (!response.ok) throw new Error('Failed to create position');
    return response.json();
  }

  async updatePosition(positionId, positionData) {
    const response = await fetch(`${API_BASE_URL}/api/positions/${positionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(positionData),
    });
    if (!response.ok) throw new Error('Failed to update position');
    return response.json();
  }

  async deletePosition(positionId) {
    const response = await fetch(`${API_BASE_URL}/api/positions/${positionId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete position');
    return response.json();
  }

  // Employee Management
  async getEmployees(filters = {}) {
    let url = `${API_BASE_URL}/api/employees`;
    const params = new URLSearchParams();
    if (filters.company_id) params.append('company_id', filters.company_id);
    if (filters.department_id) params.append('department_id', filters.department_id);
    if (filters.device_id) params.append('device_id', filters.device_id);
    if (params.toString()) url += '?' + params.toString();
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch employees');
    return response.json();
  }

  async createEmployee(employeeData) {
    const response = await fetch(`${API_BASE_URL}/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(employeeData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create employee');
    }
    return response.json();
  }

  async updateEmployee(employeeId, employeeData) {
    const response = await fetch(`${API_BASE_URL}/api/employees/${employeeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(employeeData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update employee');
    }
    return response.json();
  }

  async deleteEmployee(employeeId) {
    const response = await fetch(`${API_BASE_URL}/api/employees/${employeeId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to delete employee');
    }
    return response.json();
  }

  // Device Settings - Time & Timezone
  async getDeviceTime(deviceId) {
    const response = await fetch(`${API_BASE_URL}/api/devices/${deviceId}/time`);
    if (!response.ok) throw new Error('Failed to fetch device time');
    return response.json();
  }

  async setDeviceTime(deviceId, timezoneOffset) {
    const response = await fetch(`${API_BASE_URL}/api/devices/${deviceId}/time`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone_offset: timezoneOffset }),
    });
    if (!response.ok) throw new Error('Failed to set device time');
    return response.json();
  }

  async setAllDevicesTime(timezoneOffset) {
    const response = await fetch(`${API_BASE_URL}/api/devices/time/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone_offset: timezoneOffset }),
    });
    if (!response.ok) throw new Error('Failed to set time for all devices');
    return response.json();
  }

  // ==================== SHIFT MANAGEMENT ====================

  // Shifts CRUD
  async getShifts(filters = {}) {
    const params = new URLSearchParams();
    if (filters.is_active !== undefined) params.append('is_active', filters.is_active);
    if (filters.shift_type) params.append('shift_type', filters.shift_type);
    
    const url = params.toString() 
      ? `${API_BASE_URL}/api/shifts?${params}`
      : `${API_BASE_URL}/api/shifts`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch shifts');
    return response.json();
  }

  async getShift(shiftId) {
    const response = await fetch(`${API_BASE_URL}/api/shifts/${shiftId}`);
    if (!response.ok) throw new Error('Failed to fetch shift');
    return response.json();
  }

  async createShift(shiftData) {
    const response = await fetch(`${API_BASE_URL}/api/shifts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(shiftData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create shift');
    }
    return response.json();
  }

  async updateShift(shiftId, shiftData) {
    const response = await fetch(`${API_BASE_URL}/api/shifts/${shiftId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(shiftData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update shift');
    }
    return response.json();
  }

  async deleteShift(shiftId) {
    const response = await fetch(`${API_BASE_URL}/api/shifts/${shiftId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to delete shift');
    }
    return response.json();
  }

  // Shift Timings
  async getShiftTimings(shiftId) {
    const response = await fetch(`${API_BASE_URL}/api/shifts/${shiftId}/timings`);
    if (!response.ok) throw new Error('Failed to fetch shift timings');
    return response.json();
  }

  async addShiftTiming(shiftId, timingData) {
    const response = await fetch(`${API_BASE_URL}/api/shifts/${shiftId}/timings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(timingData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to add timing');
    }
    return response.json();
  }

  async updateShiftTiming(shiftId, timingId, timingData) {
    const response = await fetch(`${API_BASE_URL}/api/shifts/${shiftId}/timings/${timingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(timingData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update timing');
    }
    return response.json();
  }

  async deleteShiftTiming(shiftId, timingId) {
    const response = await fetch(`${API_BASE_URL}/api/shifts/${shiftId}/timings/${timingId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete timing');
    return response.json();
  }

  async getShiftEmployees(shiftId, activeOnly = true) {
    const url = `${API_BASE_URL}/api/shifts/${shiftId}/employees?active_only=${activeOnly}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch shift employees');
    return response.json();
  }

  // Employee Shift Assignments
  async getEmployeeShifts(employeeId, activeOnly = false) {
    const url = `${API_BASE_URL}/api/employees/${employeeId}/shifts?active_only=${activeOnly}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch employee shifts');
    return response.json();
  }

  async getEmployeeCurrentShift(employeeId) {
    const response = await fetch(`${API_BASE_URL}/api/employees/${employeeId}/current-shift`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Failed to fetch current shift');
    }
    return response.json();
  }

  async assignShiftToEmployee(employeeId, assignmentData) {
    const response = await fetch(`${API_BASE_URL}/api/employees/${employeeId}/shifts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assignmentData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to assign shift');
    }
    return response.json();
  }

  async updateEmployeeShiftAssignment(employeeId, assignmentId, assignmentData) {
    const response = await fetch(`${API_BASE_URL}/api/employees/${employeeId}/shifts/${assignmentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assignmentData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update assignment');
    }
    return response.json();
  }

  async deleteEmployeeShiftAssignment(employeeId, assignmentId) {
    const response = await fetch(`${API_BASE_URL}/api/employees/${employeeId}/shifts/${assignmentId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete assignment');
    return response.json();
  }

  async bulkAssignShifts(bulkData) {
    const response = await fetch(`${API_BASE_URL}/api/employees/bulk-shift-assignment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bulkData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to bulk assign shifts');
    }
    return response.json();
  }

  async getEmployeeSchedule(employeeId, startDate, endDate) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate
    });
    const response = await fetch(`${API_BASE_URL}/api/employees/${employeeId}/schedule?${params}`);
    if (!response.ok) throw new Error('Failed to fetch employee schedule');
    return response.json();
  }

  // Holiday Management
  async getHolidays(filters = {}) {
    const params = new URLSearchParams();
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (filters.holiday_type) params.append('holiday_type', filters.holiday_type);
    if (filters.country) params.append('country', filters.country);
    
    const url = params.toString() 
      ? `${API_BASE_URL}/api/holidays?${params}`
      : `${API_BASE_URL}/api/holidays`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch holidays');
    return response.json();
  }

  async getHolidaysByYear(year, country = 'MA') {
    const response = await fetch(`${API_BASE_URL}/api/holidays/year/${year}?country=${country}`);
    if (!response.ok) throw new Error('Failed to fetch holidays');
    return response.json();
  }

  async createHoliday(holidayData) {
    const response = await fetch(`${API_BASE_URL}/api/holidays`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(holidayData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create holiday');
    }
    return response.json();
  }

  async updateHoliday(holidayId, holidayData) {
    const response = await fetch(`${API_BASE_URL}/api/holidays/${holidayId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(holidayData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update holiday');
    }
    return response.json();
  }

  async deleteHoliday(holidayId) {
    const response = await fetch(`${API_BASE_URL}/api/holidays/${holidayId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete holiday');
    return response.json();
  }

  async loadMoroccoHolidays(year) {
    const response = await fetch(`${API_BASE_URL}/api/holidays/load-morocco-holidays/${year}`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to load Morocco holidays');
    }
    return response.json();
  }

  async loadAllMoroccoHolidays() {
    const response = await fetch(`${API_BASE_URL}/api/holidays/load-all-morocco-holidays`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to load Morocco holidays');
    }
    return response.json();
  }

  async checkHoliday(date, country = 'MA') {
    const response = await fetch(`${API_BASE_URL}/api/holidays/check/${date}?country=${country}`);
    if (!response.ok) throw new Error('Failed to check holiday');
    return response.json();
  }
}

export default new ApiService();
