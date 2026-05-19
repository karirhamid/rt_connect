import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Portal } from '../services/portalApi';

export default function PortalChangePassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = localStorage.getItem('portal_token');
  const [current, setCurrent] = useState(sessionStorage.getItem('portal_current_password') || '');
  const [next1, setNext1] = useState('');
  const [next2, setNext2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) navigate('/portal-login');
  }, [token, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (next1.length < 6) { setError(t('pwTooShort') || 'Mot de passe trop court (min. 6 caractères)'); return; }
    if (next1 !== next2) { setError(t('pwMismatch') || 'Les mots de passe ne correspondent pas'); return; }
    if (next1 === current) { setError(t('pwSame') || 'Le nouveau mot de passe doit être différent de l\'ancien'); return; }
    setBusy(true);
    try {
      await Portal.changePassword(current, next1);
      sessionStorage.removeItem('portal_current_password');
      navigate('/portal');
    } catch (err) {
      if (err.status === 401) navigate('/portal-login');
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-gray-100 px-4">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">{t('changePassword') || 'Changer le mot de passe'}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('changePasswordHint') || "Première connexion — veuillez définir un nouveau mot de passe."}</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('currentPassword') || 'Mot de passe actuel'}</label>
            <input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)}
                   className="w-full px-3 py-2 border rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('newPassword') || 'Nouveau mot de passe'}</label>
            <input type="password" required minLength={6} value={next1} onChange={(e) => setNext1(e.target.value)}
                   className="w-full px-3 py-2 border rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('confirmPassword') || 'Confirmer'}</label>
            <input type="password" required minLength={6} value={next2} onChange={(e) => setNext2(e.target.value)}
                   className="w-full px-3 py-2 border rounded text-sm" />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button type="submit" disabled={busy}
                  className="w-full px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">
            {busy ? '...' : (t('save') || 'Enregistrer')}
          </button>
        </form>
      </div>
    </div>
  );
}
