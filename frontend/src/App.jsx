import { useState } from 'react';
import DeviceInfo from './components/DeviceInfo';
import UserManagement from './components/UserManagement';
import AttendanceLog from './components/AttendanceLog';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('device');

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <h1>🔐 ZKTeco Device Management</h1>
          <p>RIRAKTECH SARL - Biometric Access Control System</p>
        </div>
      </header>

      <nav className="nav-tabs">
        <button
          className={activeTab === 'device' ? 'active' : ''}
          onClick={() => setActiveTab('device')}
        >
          📱 Device Info
        </button>
        <button
          className={activeTab === 'users' ? 'active' : ''}
          onClick={() => setActiveTab('users')}
        >
          👥 Users
        </button>
        <button
          className={activeTab === 'attendance' ? 'active' : ''}
          onClick={() => setActiveTab('attendance')}
        >
          📊 Attendance
        </button>
      </nav>

      <main className="content">
        {activeTab === 'device' && <DeviceInfo />}
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'attendance' && <AttendanceLog />}
      </main>

      <footer className="app-footer">
        <p>© 2025 RIRAKTECH SARL | Hamid KARIR | <a href="https://riraktech.ma" target="_blank">riraktech.ma</a></p>
        <p>📧 hamid.karir@riraktech.ma | 📞 +212 611 644 6889</p>
      </footer>
    </div>
  );
}

export default App;
