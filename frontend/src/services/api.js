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
}

export default new ApiService();
