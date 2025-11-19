const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

class ApiService {
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
}

export default new ApiService();
