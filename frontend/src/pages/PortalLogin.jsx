import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn, Lock, User } from 'lucide-react';

export default function PortalLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [matricule, setMatricule] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const res = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matricule: matricule.trim(), pin: pin.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Identifiants invalides');
      }
      const data = await res.json();
      localStorage.setItem('portal_token', data.access_token);
      localStorage.setItem('portal_employee', JSON.stringify(data.employee));
      navigate('/portal');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-gray-100 px-4">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary-100 text-primary-700 mb-3">
            <User className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{t('portalTitle') || 'Espace employé'}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('portalLoginHint') || 'Connectez-vous avec votre matricule et votre code PIN.'}</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('matricule') || 'Matricule'}</label>
            <input type="text" autoFocus required value={matricule} onChange={(e) => setMatricule(e.target.value)}
                   className="w-full px-3 py-2 border rounded text-sm" placeholder="ex. 1024" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('pin') || 'Code PIN'}</label>
            <input type="password" inputMode="numeric" pattern="[0-9]*" required value={pin} onChange={(e) => setPin(e.target.value)}
                   className="w-full px-3 py-2 border rounded text-sm" placeholder="••••" maxLength={6} />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button type="submit" disabled={busy}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">
            <LogIn className="w-4 h-4" /> {busy ? '...' : (t('login') || 'Se connecter')}
          </button>
        </form>

        <div className="mt-5 text-center">
          <a href="/login" className="text-xs text-gray-500 hover:text-primary-600">{t('adminLogin') || 'Accès administrateur'} →</a>
        </div>
      </div>
    </div>
  );
}
