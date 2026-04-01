import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Plus, Edit, ChevronRight } from 'lucide-react';
import api from '../services/api';
import RolePermissionMatrix from '../components/RolePermissionMatrix';

const ROLE_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-700', icon: 'bg-blue-500' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: 'bg-emerald-500' },
  { bg: 'bg-purple-100', text: 'text-purple-700', icon: 'bg-purple-500' },
  { bg: 'bg-amber-100', text: 'text-amber-700', icon: 'bg-amber-500' },
  { bg: 'bg-rose-100', text: 'text-rose-700', icon: 'bg-rose-500' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700', icon: 'bg-cyan-500' },
];

export default function RolesManagement(){
  const { t } = useTranslation();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ id: null, name: '', description: '', permissions: [] });
  const [notification, setNotification] = useState(null);
  const [permissions, setPermissions] = useState(new Set());

  useEffect(()=>{ load(); loadPermissions(); }, []);

  const loadPermissions = async ()=>{
    try{
      const p = await api.getPermissions();
      setPermissions(new Set((p||[]).map(x=>x.code)));
    }catch(e){ console.error(e); }
  }

  const load = async ()=>{
    setLoading(true);
    try{
      const res = await api.getRoles();
      setRoles(res || []);
    }catch(e){
      console.error(e);
      setNotification({ type: 'error', message: t('failedToLoadRoles') });
    }finally{ setLoading(false); }
  };

  const submit = async ()=>{
    try{
      if (form.id) {
        await api.updateRole(form.id, { name: form.name, description: form.description, permissions: form.permissions });
        setNotification({ type: 'success', message: t('roleUpdated') });
      } else {
        await api.createRole({ name: form.name, description: form.description, permissions: form.permissions });
        setNotification({ type: 'success', message: t('roleCreated') });
      }
      setShowCreate(false);
      await load();
    }catch(e){
      console.error(e);
      setNotification({ type: 'error', message: e.message || t('failedToCreateRole') });
    }
  };

  const onEdit = (r) => { setForm({ id: r.id, name: r.name, description: r.description || '', permissions: r.permissions || [] }); setShowCreate(true); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('rolesPermissions')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('manageRolesDescription') || 'Manage access roles and their permissions'}</p>
        </div>
        <div>
          {permissions.has('roles.manage') && (
            <button onClick={()=>{ setForm({ name:'', description:'', permissions: [] }); setShowCreate(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium text-sm shadow-sm">
              <Plus className="w-4 h-4" /> {t('createRole')}
            </button>
          )}
        </div>
      </div>

      {notification && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium ${notification.type==='success'?'bg-green-50 text-green-800 border-green-200':'bg-red-50 text-red-800 border-red-200'}`}>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${notification.type==='success'?'bg-green-500':'bg-red-500'}`} />
          {notification.message}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gray-200 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-24" />
                  <div className="h-3 bg-gray-100 rounded w-32" />
                </div>
              </div>
              <div className="h-3 bg-gray-100 rounded w-full" />
            </div>
          ))}
        </div>
      ) : roles.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-16 text-gray-400">
          <Shield className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-sm">{t('noData')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map((r, idx) => {
            const color = ROLE_COLORS[idx % ROLE_COLORS.length];
            const permCount = (r.permissions || []).length;
            return (
              <div key={r.id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow group">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${color.bg} flex items-center justify-center`}>
                        <Shield className={`w-5 h-5 ${color.text}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{r.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{r.description || t('noDescription') || 'No description'}</p>
                      </div>
                    </div>
                    {permissions.has('roles.manage') && (
                      <button onClick={() => onEdit(r)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                        <Edit className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${color.bg} ${color.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${color.icon}`} />
                      {permCount} {t('permissions')}
                    </span>
                    {permissions.has('roles.manage') && (
                      <button onClick={() => onEdit(r)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary-600 transition-colors">
                        {t('edit')} <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{form.id ? t('editRole') : t('createRole')}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{form.id ? t('editRoleDescription') || 'Update role details & permissions' : t('createRoleDescription') || 'Define a new role with permissions'}</p>
              </div>
              <button onClick={()=>setShowCreate(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('roleName')} <span className="text-red-500">*</span></label>
                  <input value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm" placeholder={t('enterRoleName') || 'e.g. Manager'} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('roleDescription')}</label>
                  <input value={form.description} onChange={e=>setForm({...form, description: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors text-sm" placeholder={t('enterRoleDescription') || 'Brief description'} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('permissions')}</label>
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-4">
                  <RolePermissionMatrix value={form.permissions} onChange={(list)=>setForm({...form, permissions: list})} />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
              <button onClick={()=>setShowCreate(false)} className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm">{t('cancel')}</button>
              <button onClick={submit} className="px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium text-sm shadow-sm">{form.id ? t('save') : t('createRole')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
