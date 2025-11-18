import { useState, useEffect } from 'react';
import api from '../services/api';
import './AttendanceLog.css';

function AttendanceLog() {
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    user_id: '',
    start_date: '',
    end_date: ''
  });

  const fetchAttendance = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAttendance(filters);
      setAttendance(data.attendance || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, []);

  const handleFilter = (e) => {
    e.preventDefault();
    fetchAttendance();
  };

  const handleClearAttendance = async () => {
    if (!confirm('Are you sure you want to clear ALL attendance records? This cannot be undone!')) return;
    
    setLoading(true);
    setError(null);
    try {
      await api.clearAttendance();
      alert('Attendance records cleared successfully!');
      fetchAttendance();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['User ID', 'Name', 'Timestamp', 'Status', 'Punch'];
    const rows = attendance.map(record => [
      record.user_id,
      record.user_name || 'Unknown',
      new Date(record.timestamp).toLocaleString(),
      record.status,
      record.punch
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getPunchLabel = (punch) => {
    switch (punch) {
      case 0: return 'Check In';
      case 1: return 'Check Out';
      case 2: return 'Break Out';
      case 3: return 'Break In';
      case 4: return 'OT In';
      case 5: return 'OT Out';
      default: return `Type ${punch}`;
    }
  };

  const getStatusBadge = (status) => {
    const statusNum = parseInt(status);
    if (statusNum === 0 || statusNum === 1) {
      return <span className="status-badge verified">✓ Verified</span>;
    }
    return <span className="status-badge unverified">? Unverified</span>;
  };

  return (
    <div className="attendance-log">
      <div className="header">
        <h2>Attendance Log</h2>
        <div className="header-actions">
          <button onClick={exportToCSV} disabled={loading || attendance.length === 0}>
            📥 Export CSV
          </button>
          <button onClick={handleClearAttendance} disabled={loading} className="danger">
            🗑️ Clear All
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <form onSubmit={handleFilter} className="filter-form">
        <h3>Filters</h3>
        <div className="filter-grid">
          <input
            type="text"
            placeholder="User ID"
            value={filters.user_id}
            onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}
          />
          <input
            type="date"
            placeholder="Start Date"
            value={filters.start_date}
            onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
          />
          <input
            type="date"
            placeholder="End Date"
            value={filters.end_date}
            onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
          />
          <button type="submit" disabled={loading}>🔍 Filter</button>
          <button
            type="button"
            onClick={() => {
              setFilters({ user_id: '', start_date: '', end_date: '' });
              setTimeout(fetchAttendance, 100);
            }}
            disabled={loading}
          >
            ✖ Clear Filters
          </button>
        </div>
      </form>

      <div className="stats">
        <div className="stat-card">
          <span className="stat-label">Total Records</span>
          <span className="stat-value">{attendance.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Today's Records</span>
          <span className="stat-value">
            {attendance.filter(r => 
              new Date(r.timestamp).toDateString() === new Date().toDateString()
            ).length}
          </span>
        </div>
        <button onClick={fetchAttendance} disabled={loading}>🔄 Refresh</button>
      </div>

      {loading && attendance.length === 0 ? (
        <div className="loading">Loading attendance records...</div>
      ) : (
        <div className="attendance-table">
          <table>
            <thead>
              <tr>
                <th>User ID</th>
                <th>Name</th>
                <th>Date & Time</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {attendance.map((record, index) => (
                <tr key={index}>
                  <td>{record.user_id}</td>
                  <td>{record.user_name || 'Unknown'}</td>
                  <td>{new Date(record.timestamp).toLocaleString()}</td>
                  <td>
                    <span className="punch-badge">{getPunchLabel(record.punch)}</span>
                  </td>
                  <td>{getStatusBadge(record.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {attendance.length === 0 && (
            <div className="no-data">No attendance records found</div>
          )}
        </div>
      )}
    </div>
  );
}

export default AttendanceLog;
