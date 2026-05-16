import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

export default function RolePermissionMatrix({ value = [], onChange }) {
  const { t } = useTranslation();
  const [permissions, setPermissions] = useState([]);
  const [selected, setSelected] = useState(new Set(value || []));

  useEffect(() => {
    loadPermissions();
  }, []);

  useEffect(() => {
    setSelected(new Set(value || []));
  }, [value]);

  const loadPermissions = async () => {
    try {
      const data = await api.getPermissions();
      setPermissions(data || []);
    } catch (e) {
      console.error('Failed to load permissions', e);
      setPermissions([]);
    }
  };

  const toggle = (code) => {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code); else next.add(code);
    setSelected(next);
    onChange && onChange(Array.from(next));
  };

  if (!permissions || permissions.length === 0) {
    return <div className="text-sm text-gray-500">{t('noPermissionsAvailable') || 'Aucune permission disponible'}</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {permissions.map(p => (
        <label key={p.code} className="flex items-center gap-3 p-3 rounded-lg border hover:shadow-sm cursor-pointer">
          <input type="checkbox" checked={selected.has(p.code)} onChange={() => toggle(p.code)} className="w-4 h-4" />
          <div className="flex-1">
            <div className="font-medium text-gray-800">{p.code}</div>
            <div className="text-xs text-gray-500">{p.description}</div>
          </div>
        </label>
      ))}
    </div>
  );
}
