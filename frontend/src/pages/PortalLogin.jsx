import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn } from 'lucide-react';
import { Portal } from '../services/portalApi';

export default function PortalLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [matricule, setMatricule] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [probing, setProbing] = useState(true);

  React.useEffect(() => {
    Portal.isEnabled()
      .then((d) => setEnabled(!!d.enabled))
      .catch(() => setEnabled(false))
      .finally(() => setProbing(false));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const data = await Portal.login(matricule.trim(), password.trim());
      if (!data || !data.access_token) {
        throw new Error(t('loginFailed') || 'Échec de la connexion');
      }
      localStorage.setItem('portal_token', data.access_token);
      localStorage.setItem('portal_employee', JSON.stringify(data.employee || {}));
      if (data.must_change_password) {
        sessionStorage.setItem('portal_current_password', password.trim());
        navigate('/portal-change-password');
      } else {
        navigate('/portal');
      }
    } catch (err) {
      if (err.status === 503) setEnabled(false);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (probing) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">…</div>;
  }
  if (!enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-gray-100 px-4">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">{t('portalTitle') || 'Espace employé'}</h1>
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
            {t('portalDisabled') || "L'espace employé est désactivé par l'administrateur."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-gray-100 px-4">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">{t('portalTitle') || 'Espace employé'}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('portalLoginHint') || 'Connectez-vous avec votre matricule et votre mot de passe.'}</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('matricule') || 'Matricule'}</label>
            <input type="text" autoFocus required value={matricule} onChange={(e) => setMatricule(e.target.value)}
                   className="w-full px-3 py-2 border rounded text-sm" placeholder="ex. 1024" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('password') || 'Mot de passe'}</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                   className="w-full px-3 py-2 border rounded text-sm" placeholder="••••••" />
            <p className="text-xs text-gray-400 mt-1">{t('portalInitialPasswordHint') || "Première connexion : votre prénom."}</p>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button type="submit" disabled={busy}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">
            <LogIn className="w-4 h-4" /> {busy ? '...' : (t('login') || 'Se connecter')}
          </button>
        </form>

      </div>
    </div>
  );
}
