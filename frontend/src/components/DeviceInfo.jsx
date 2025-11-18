import { useState, useEffect } from 'react';
import api from '../services/api';
import './DeviceInfo.css';

function DeviceInfo() {
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDeviceInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDeviceInfo();
      setDeviceInfo(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeviceInfo();
  }, []);

  const handleDeviceAction = async (action) => {
    setLoading(true);
    setError(null);
    try {
      let result;
      switch (action) {
        case 'enable':
          result = await api.enableDevice();
          break;
        case 'disable':
          result = await api.disableDevice();
          break;
        case 'restart':
          result = await api.restartDevice();
          break;
        case 'poweroff':
          result = await api.powerOffDevice();
          break;
        case 'test-voice':
          result = await api.testVoice(0);
          break;
        default:
          return;
      }
      alert(result.message || 'Action completed successfully');
      if (action !== 'poweroff') {
        setTimeout(fetchDeviceInfo, 2000);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !deviceInfo) {
    return <div className="device-info loading">Loading device information...</div>;
  }

  return (
    <div className="device-info">
      <h2>Device Information</h2>
      
      {error && <div className="error">{error}</div>}
      
      {deviceInfo && (
        <div className="info-grid">
          <div className="info-item">
            <span className="label">Serial Number:</span>
            <span className="value">{deviceInfo.serial_number}</span>
          </div>
          <div className="info-item">
            <span className="label">Model:</span>
            <span className="value">{deviceInfo.model || 'N/A'}</span>
          </div>
          <div className="info-item">
            <span className="label">Firmware:</span>
            <span className="value">{deviceInfo.firmware_version}</span>
          </div>
          <div className="info-item">
            <span className="label">Platform:</span>
            <span className="value">{deviceInfo.platform}</span>
          </div>
          <div className="info-item">
            <span className="label">Users:</span>
            <span className="value">{deviceInfo.user_count}</span>
          </div>
          <div className="info-item">
            <span className="label">Records:</span>
            <span className="value">{deviceInfo.record_count}</span>
          </div>
          <div className="info-item">
            <span className="label">Device Name:</span>
            <span className="value">{deviceInfo.device_name}</span>
          </div>
        </div>
      )}

      <div className="actions">
        <button onClick={() => fetchDeviceInfo()} disabled={loading}>
          🔄 Refresh
        </button>
        <button onClick={() => handleDeviceAction('enable')} disabled={loading}>
          ✅ Enable Device
        </button>
        <button onClick={() => handleDeviceAction('disable')} disabled={loading}>
          ⏸️ Disable Device
        </button>
        <button onClick={() => handleDeviceAction('test-voice')} disabled={loading}>
          🔊 Test Voice
        </button>
        <button onClick={() => handleDeviceAction('restart')} disabled={loading} className="warning">
          🔄 Restart
        </button>
        <button onClick={() => handleDeviceAction('poweroff')} disabled={loading} className="danger">
          ⚡ Power Off
        </button>
      </div>
    </div>
  );
}

export default DeviceInfo;
