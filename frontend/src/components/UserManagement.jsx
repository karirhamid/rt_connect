import { useState, useEffect } from 'react';
import api from '../services/api';
import './UserManagement.css';

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser] = useState({
    uid: '',
    name: '',
    privilege: 0,
    password: '',
    group_id: '',
    user_id: ''
  });

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getUsers();
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.addUser(newUser);
      alert('User added successfully!');
      setShowAddForm(false);
      setNewUser({ uid: '', name: '', privilege: 0, password: '', group_id: '', user_id: '' });
      fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (uid) => {
    if (!confirm(`Are you sure you want to delete user ${uid}?`)) return;
    
    setLoading(true);
    setError(null);
    try {
      await api.deleteUser(uid);
      alert('User deleted successfully!');
      fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getPrivilegeLabel = (privilege) => {
    switch (privilege) {
      case 0: return 'User';
      case 14: return 'Admin';
      default: return `Level ${privilege}`;
    }
  };

  return (
    <div className="user-management">
      <div className="header">
        <h2>User Management</h2>
        <button onClick={() => setShowAddForm(!showAddForm)} className="add-btn">
          {showAddForm ? '✖ Cancel' : '➕ Add User'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {showAddForm && (
        <form onSubmit={handleAddUser} className="add-form">
          <h3>Add New User</h3>
          <div className="form-grid">
            <input
              type="text"
              placeholder="User ID *"
              value={newUser.uid}
              onChange={(e) => setNewUser({ ...newUser, uid: e.target.value })}
              required
            />
            <input
              type="text"
              placeholder="Name *"
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              required
            />
            <select
              value={newUser.privilege}
              onChange={(e) => setNewUser({ ...newUser, privilege: parseInt(e.target.value) })}
            >
              <option value={0}>User</option>
              <option value={14}>Admin</option>
            </select>
            <input
              type="text"
              placeholder="Password"
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            />
            <input
              type="text"
              placeholder="Group ID"
              value={newUser.group_id}
              onChange={(e) => setNewUser({ ...newUser, group_id: e.target.value })}
            />
            <input
              type="text"
              placeholder="Card ID"
              value={newUser.user_id}
              onChange={(e) => setNewUser({ ...newUser, user_id: e.target.value })}
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Adding...' : 'Add User'}
          </button>
        </form>
      )}

      <div className="users-stats">
        <div className="stat-card">
          <span className="stat-label">Total Users</span>
          <span className="stat-value">{users.length}</span>
        </div>
        <button onClick={fetchUsers} disabled={loading}>🔄 Refresh</button>
      </div>

      {loading && users.length === 0 ? (
        <div className="loading">Loading users...</div>
      ) : (
        <div className="users-table">
          <table>
            <thead>
              <tr>
                <th>UID</th>
                <th>Name</th>
                <th>Privilege</th>
                <th>Group ID</th>
                <th>Card ID</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.uid}>
                  <td>{user.uid}</td>
                  <td>{user.name}</td>
                  <td>
                    <span className={`privilege-badge ${user.privilege === 14 ? 'admin' : 'user'}`}>
                      {getPrivilegeLabel(user.privilege)}
                    </span>
                  </td>
                  <td>{user.group_id || '-'}</td>
                  <td>{user.user_id || '-'}</td>
                  <td>
                    <button
                      onClick={() => handleDeleteUser(user.uid)}
                      disabled={loading}
                      className="delete-btn"
                    >
                      🗑️ Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default UserManagement;
