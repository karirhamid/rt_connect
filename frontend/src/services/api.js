// In Docker / production builds, VITE_API_URL is set to "" so the frontend
// uses relative paths (/api/...) — Nginx proxies them to the backend.
// In local dev (no env var), fall back to the dev server on :8000.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

class ApiService {
  constructor(){
    this._accessToken = null;
    this._refreshToken = null;
    try{
      this._accessToken = localStorage.getItem('access_token');
      // refresh token is stored in an HttpOnly secure cookie in production;
      // do not store it in localStorage. Keep in-memory reference only.
      this._refreshToken = null;
    }catch(e){}
  }

  setAccessToken(token){
    this._accessToken = token;
    try{ if(token) localStorage.setItem('access_token', token); else localStorage.removeItem('access_token'); }catch(e){}
  }

  setRefreshToken(token){
    // No-op: refresh tokens are kept in HttpOnly cookies. Keep a transient
    // in-memory token only if explicitly provided (not persisted).
    this._refreshToken = token || null;
  }

  getAccessToken(){ return this._accessToken; }

  // Convenience HTTP helpers (return { data, status, response } like axios)
  async get(path, options = {}) {
    const resp = await this.authFetch(`/api${path}`, options);
    const isBlob = options.responseType === 'blob';
    const data = isBlob ? await resp.blob() : await resp.json().catch(() => null);
    if (!resp.ok) {
      const err = new Error(data?.detail || resp.statusText);
      err.response = { data, status: resp.status };
      throw err;
    }
    return { data, status: resp.status, response: resp };
  }

  async post(path, payload, options = {}) {
    const fetchOpts = { method: 'POST', ...options };
    if (payload !== undefined) {
      fetchOpts.headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
      fetchOpts.body = JSON.stringify(payload);
    }
    const resp = await this.authFetch(`/api${path}`, fetchOpts);
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      const err = new Error(data?.detail || resp.statusText);
      err.response = { data, status: resp.status };
      throw err;
    }
    return { data, status: resp.status };
  }

  async delete(path, options = {}) {
    const resp = await this.authFetch(`/api${path}`, { method: 'DELETE', ...options });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      const err = new Error(data?.detail || resp.statusText);
      err.response = { data, status: resp.status };
      throw err;
    }
    return { data, status: resp.status };
  }

  async authFetch(path, options = {}){
    const url = path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
    options.headers = options.headers || {};
    // Ensure credentials are included so refresh cookie (HttpOnly) is sent.
    options.credentials = options.credentials || 'include';
    if (this._accessToken) options.headers['Authorization'] = `Bearer ${this._accessToken}`;
    let resp = await fetch(url, options);
    // If access token expired (401), attempt a cookie-based refresh and retry once.
    // We don't rely on an in-memory `_refreshToken` because refresh tokens
    // are stored in an HttpOnly cookie on the server; `refreshAccessToken`
    // will call the refresh endpoint with `credentials: 'include'`.
    if (resp.status === 401) {
      try {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          options.headers['Authorization'] = `Bearer ${this._accessToken}`;
          resp = await fetch(url, options);
        } else {
          // Refresh endpoint returned non-ok; clear tokens
          this.logout();
        }
      } catch (e) {
        this.logout();
        throw e;
      }
    }
    return resp;
  }

  async login(username, password){
    const resp = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(()=>({}));
      throw new Error(err.detail || 'Login failed');
    }
    const data = await resp.json();
    if (data.access_token) this.setAccessToken(data.access_token);
    // backend sets the refresh token as an HttpOnly cookie; no localStorage.
    return data;
  }

  logout(){ this.setAccessToken(null); this.setRefreshToken(null); }

  async logoutRemote(){
    try{
      await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    }catch(e){}
    this.setAccessToken(null);
    this.setRefreshToken(null);
  }

  async refreshAccessToken(){
    // Use HttpOnly refresh cookie to obtain a new access token. `credentials: 'include'`
    // ensures the browser sends the cookie to the refresh endpoint.
    const resp = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!resp.ok) {
      // clear tokens
      this.logout();
      return false;
    }
    const data = await resp.json();
    if (data.access_token) this.setAccessToken(data.access_token);
    // The refresh token cookie is rotated by the server; do not store it client-side.
    return true;
  }

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
  // Device Discovery (with 25s client-side timeout as safety net)
  async discoverDevice(ip, port = 4370) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`${API_BASE_URL}/api/device/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, port }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to discover device');
      }
      return response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Discovery timed out — check the IP address and make sure the device is powered on.');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
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
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to add device');
    }
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

  async syncAttendanceFromDevice(deviceId, days = 30, previewOnly = false, { startDate, endDate } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 min
    const params = new URLSearchParams({ days: String(days) });
    if (previewOnly) params.set('preview_only', 'true');
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    const url = `${API_BASE_URL}/api/devices/${deviceId}/sync-attendance?${params}`;
    try {
      const response = await fetch(url, { method: 'POST', signal: controller.signal });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to sync attendance');
      }
      return response.json();
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Attendance sync timed out — the device may be slow. Please try again.');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async confirmAttendanceSync(deviceId, days = 30, { startDate, endDate } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 min
    const params = new URLSearchParams({ days: String(days) });
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    try {
      const response = await fetch(`${API_BASE_URL}/api/devices/${deviceId}/confirm-attendance-sync?${params}`, {
        method: 'POST',
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to confirm attendance sync');
      }
      return response.json();
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Attendance sync timed out — the device may be slow. Please try again.');
      throw err;
    } finally {
      clearTimeout(timer);
    }
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

  // -------------------- Users / Roles / Permissions (RBAC) --------------------
  async listSystemUsers() {
    const response = await this.authFetch('/api/users/users');
    if (!response.ok) throw new Error('Failed to fetch users');
    return response.json();
  }

  async createSystemUser(userData) {
    const response = await this.authFetch('/api/users/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create user');
    }
    return response.json();
  }

  async updateSystemUser(userId, userData) {
    const response = await this.authFetch(`/api/users/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to update user');
    }
    return response.json();
  }

  async deleteSystemUser(userId) {
    const response = await this.authFetch(`/api/users/users/${userId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to delete user');
    }
    return response.json();
  }

  async getRoles() {
    const response = await this.authFetch('/api/users/roles');
    if (!response.ok) throw new Error('Failed to fetch roles');
    return response.json();
  }

  async createRole(roleData) {
    const response = await this.authFetch('/api/users/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roleData),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create role');
    }
    return response.json();
  }

  async updateRole(roleId, roleData) {
    const response = await this.authFetch(`/api/users/roles/${roleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roleData),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to update role');
    }
    return response.json();
  }

  async getPermissions() {
    const response = await this.authFetch('/api/users/permissions');
    if (!response.ok) throw new Error('Failed to fetch permissions');
    return response.json();
  }

  async getCurrentUser() {
    const response = await this.authFetch('/api/auth/me');
    if (!response.ok) throw new Error('Failed to fetch current user');
    return response.json();
  }

  async getMyPermissions() {
    const response = await this.authFetch('/api/auth/me/permissions');
    if (!response.ok) throw new Error('Failed to fetch permissions');
    const data = await response.json();
    return data.permissions || [];
  }

  // ==================== EMAIL SETTINGS ====================

  async getEmailSettings() {
    const r = await this.authFetch('/api/email-settings');
    if (!r.ok) throw new Error('Failed to load email settings');
    return r.json();
  }

  async saveEmailSettings(data) {
    const r = await this.authFetch('/api/email-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || 'Failed to save'); }
    return r.json();
  }

  async testEmail(to) {
    const r = await this.authFetch('/api/email-settings/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || 'Test failed'); }
    return r.json();
  }

  // ==================== REPORT SCHEDULES ====================

  async getReportSchedules() {
    const r = await this.authFetch('/api/report-schedules');
    if (!r.ok) throw new Error('Failed to load schedules');
    return r.json();
  }

  async createReportSchedule(data) {
    const r = await this.authFetch('/api/report-schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || 'Failed to create'); }
    return r.json();
  }

  async updateReportSchedule(id, data) {
    const r = await this.authFetch(`/api/report-schedules/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || 'Failed to update'); }
    return r.json();
  }

  async deleteReportSchedule(id) {
    const r = await this.authFetch(`/api/report-schedules/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('Failed to delete');
  }

  async toggleReportSchedule(id) {
    const r = await this.authFetch(`/api/report-schedules/${id}/toggle`, { method: 'PATCH' });
    if (!r.ok) throw new Error('Failed to toggle');
    return r.json();
  }

  async getScheduleLogs(id) {
    const r = await this.authFetch(`/api/report-schedules/${id}/logs`);
    if (!r.ok) throw new Error('Failed to load logs');
    return r.json();
  }

  async runScheduleNow(id) {
    const r = await this.authFetch(`/api/report-schedules/${id}/run-now`, { method: 'POST' });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || 'Failed to run'); }
    return r.json();
  }

  async getScheduleDefaultTemplates() {
    const r = await this.authFetch('/api/report-schedules/defaults/templates');
    if (!r.ok) throw new Error('Failed to load templates');
    return r.json();
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

  async getEmployeeCurrentShift(employeeId) {
    const response = await fetch(`${API_BASE_URL}/api/employees/${employeeId}/current-shift`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Failed to fetch current shift');
    }
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

  // ── Employee Schedule (personal timing — weekly) ──────────────
  async getEmployeePersonalSchedule(employeeId) {
    const response = await this.authFetch(`/api/employees/${employeeId}/personal-schedule`);
    if (!response.ok) throw new Error('Failed to fetch employee schedule');
    return response.json();
  }

  async saveEmployeePersonalSchedule(employeeId, scheduleData) {
    const response = await this.authFetch(`/api/employees/${employeeId}/personal-schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scheduleData),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to save schedule');
    }
    return response.json();
  }

  async deleteEmployeePersonalSchedule(employeeId) {
    const response = await this.authFetch(`/api/employees/${employeeId}/personal-schedule`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to delete schedule');
    }
    return response.json();
  }

  // ── Department Schedule (category timing template — weekly) ──
  async getDepartmentSchedule(departmentId) {
    const response = await this.authFetch(`/api/departments/${departmentId}/schedule`);
    if (!response.ok) throw new Error('Failed to fetch department schedule');
    return response.json();
  }

  async saveDepartmentSchedule(departmentId, scheduleData) {
    const response = await this.authFetch(`/api/departments/${departmentId}/schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scheduleData),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to save department schedule');
    }
    return response.json();
  }

  async deleteDepartmentSchedule(departmentId) {
    const response = await this.authFetch(`/api/departments/${departmentId}/schedule`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to delete department schedule');
    }
    return response.json();
  }

  // ── Classified attendance ────────────────────────────────────
  async getClassifiedAttendance(date, filters = {}) {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (filters.employee_name) params.append('employee_name', filters.employee_name);
    if (filters.device_id) params.append('device_id', filters.device_id);
    const response = await this.authFetch(`/api/attendance/classified?${params}`);
    if (!response.ok) throw new Error('Failed to fetch classified attendance');
    return response.json();
  }

}

export default new ApiService();
