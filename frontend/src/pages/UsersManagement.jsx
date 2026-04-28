import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { Plus, Trash, Edit, Users } from 'lucide-react';
import Dialog from '../components/Dialog';

export default function UsersManagement() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', roles: [] });
  const [availableRoles, setAvailableRoles] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [permissions, setPermissions] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const [notification, setNotification] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.listSystemUsers();
      setUsers(res || []);

      // Load current user first — we need their role names to derive permissions
      let me = null;
      try { me = await api.getCurrentUser(); setCurrentUser(me || null); } catch (e) { /* ignore */ }

      // Load roles (requires roles.read — may fail for restricted users)
      let roles = [];
      try { roles = await api.getRoles() || []; } catch (e) { /* no roles.read permission */ }
      setAvailableRoles(roles);

      // Derive this user's permissions from their roles — NOT from the global permission list
      const myRoleNames = new Set(me?.roles || []);
      const perms = new Set();
      roles.forEach(r => {
        if (myRoleNames.has(r.name)) {
          (r.permissions || []).forEach(p => perms.add(p));
        }
      });
      // Super Admin: if user has Administrator role, ensure all perms represented
      if (myRoleNames.has('Administrator')) {
        perms.add('users.create'); perms.add('users.update');
        perms.add('users.delete'); perms.add('roles.manage');
      }
      setPermissions(perms);

      // Store in localStorage so other pages can read them without an extra API call
      try { localStorage.setItem('_userPerms', JSON.stringify([...perms])); } catch (e) {}
    } catch (e) {
      console.error(e);
      setNotification({ type: 'error', message: t('failedToLoadUsers') });
    } finally { setLoading(false); }
  };

  const openCreate = () => { setForm({ username: '', email: '', password: '', roles: [] }); setEditing(null); setShowCreate(true); };

  const submit = async () => {
    try {
      if (editing) {
        await api.updateSystemUser(editing.id, { email: form.email, password: form.password || undefined, is_active: true, roles: form.roles });
        setNotification({ type: 'success', message: t('userUpdated') });
      } else {
        await api.createSystemUser(form);
        setNotification({ type: 'success', message: t('userCreated') });
      }
      setShowCreate(false);
      await load();
    } catch (e) {
      console.error(e);
      setNotification({ type: 'error', message: e.message || t('failedToCreateUser') });
    }
  };

  const onEdit = (u) => { setEditing(u); setForm({ username: u.username, email: u.email || '', password: '', roles: u.roles || [] }); setShowCreate(true); };

  const onDelete = async (u) => {
    if (!confirm(t('confirmDeleteUser'))) return;
    try {
      await api.deleteSystemUser(u.id);
      setNotification({ type: 'success', message: t('userDeleted') });
      await load();
    } catch (e) {
      setNotification({ type: 'error', message: t('failedToDeleteUser') });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('systemUsers')}</h1>
        <div className="flex items-center gap-3">
          {permissions.has('users.create') && (
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium text-sm shadow-sm">
              <Plus className="w-4 h-4"/> {t('createUser')}
            </button>
          )}
        </div>
      </div>

      {notification && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium ${notification.type==='success'?'bg-green-50 text-green-800 border-green-200':'bg-red-50 text-red-800 border-red-200'}`}>
          {notification.type === 'success' ? <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" /> : <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
          {notification.message}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Users className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">{t('noData')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('usernameLabel')}</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('email')}</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('roles')}</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-primary-700 font-semibold text-xs">{u.username?.charAt(0)?.toUpperCase()}</span>
                        </div>
                        <span className="font-medium text-gray-900 text-sm">{u.username}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">{u.email || <span className="text-gray-300">—</span>}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        {(u.roles||[]).length > 0 ? (u.roles||[]).map(r => (
                          <span key={r} className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">{r}</span>
                        )) : <span className="text-xs text-gray-300">—</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {permissions.has('users.update') && (
                          <button onClick={() => onEdit(u)} className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title={t('edit')}>
                            <Edit className="w-4 h-4"/>
                          </button>
                        )}
                        {permissions.has('users.delete') && (
                          <button onClick={() => onDelete(u)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={t('delete')}>
                            <Trash className="w-4 h-4"/>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{editing ? t('editUser') : t('createUser')}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{editing ? t('updateUserDetails') || 'Update user account details' : t('createNewAccount') || 'Create a new system user account'}</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('usernameLabel')} <span className="text-red-500">*</span></label>
                <input
                  value={form.username}
                  onChange={e => setForm({...form, username: e.target.value})}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm disabled:bg-gray-50 disabled:text-gray-500"
                  disabled={!!editing}
                  placeholder={t('enterUsername') || 'Enter username'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('email')}</label>
                <input
                  value={form.email}
                  onChange={e => setForm({...form, email: e.target.value})}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                  type="email"
                  placeholder={t('enterEmail') || 'email@example.com'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('passwordLabel')} {editing && <span className="text-xs text-gray-400 font-normal">({t('leaveBlankToKeep')})</span>}
                  {!editing && <span className="text-red-500">*</span>}
                </label>
                <input
                  value={form.password}
                  onChange={e => setForm({...form, password: e.target.value})}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm"
                  type="password"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('roles')}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Admins cannot assign the Super Admin (Administrator) role */}
                  {availableRoles.filter(r => permissions.has('roles.manage') || r.name !== 'Administrator').map(r => (
                    <label key={r.id} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${(form.roles||[]).includes(r.name) ? 'bg-primary-50 border-primary-300 ring-1 ring-primary-200' : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
                      <input
                        type="checkbox"
                        checked={(form.roles||[]).includes(r.name)}
                        onChange={() => {
                          const next = new Set(form.roles || []);
                          if (next.has(r.name)) next.delete(r.name); else next.add(r.name);
                          setForm({...form, roles: Array.from(next)});
                        }}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{r.name}</div>
                        {r.description && <div className="text-xs text-gray-500 mt-0.5">{r.description}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm">{t('cancel')}</button>
              <button onClick={submit} className="px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium text-sm shadow-sm">{editing ? t('save') : t('createUser')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
