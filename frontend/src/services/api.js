// API Service for ZKTeco Device Management
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

class ApiService {
  // Device Management
  async getDeviceInfo() {
    const response = await fetch(`${API_BASE_URL}/api/device/info`);
    if (!response.ok) throw new Error('Failed to fetch device info');
    return response.json();
  }

  async enableDevice() {
    const response = await fetch(`${API_BASE_URL}/api/device/enable`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to enable device');
    return response.json();
  }

  async disableDevice() {
    const response = await fetch(`${API_BASE_URL}/api/device/disable`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to disable device');
    return response.json();
  }

  async restartDevice() {
    const response = await fetch(`${API_BASE_URL}/api/device/restart`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to restart device');
    return response.json();
  }

  async powerOffDevice() {
    const response = await fetch(`${API_BASE_URL}/api/device/poweroff`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to power off device');
    return response.json();
  }

  async testVoice(index = 0) {
    const response = await fetch(`${API_BASE_URL}/api/device/test-voice/${index}`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to test voice');
    return response.json();
  }

  // User Management
  async getUsers() {
    const response = await fetch(`${API_BASE_URL}/api/users/`);
    if (!response.ok) throw new Error('Failed to fetch users');
    return response.json();
  }

  async addUser(userData) {
    const response = await fetch(`${API_BASE_URL}/api/users/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    if (!response.ok) throw new Error('Failed to add user');
    return response.json();
  }

  async deleteUser(uid) {
    const response = await fetch(`${API_BASE_URL}/api/users/${uid}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete user');
    return response.json();
  }

  // Attendance Management
  async getAttendance(params = {}) {
    const queryParams = new URLSearchParams();
    if (params.user_id) queryParams.append('user_id', params.user_id);
    if (params.start_date) queryParams.append('start_date', params.start_date);
    if (params.end_date) queryParams.append('end_date', params.end_date);

    const url = `${API_BASE_URL}/api/attendance/?${queryParams}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch attendance');
    return response.json();
  }

  async clearAttendance() {
    const response = await fetch(`${API_BASE_URL}/api/attendance/clear`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to clear attendance');
    return response.json();
  }
}

export default new ApiService();
