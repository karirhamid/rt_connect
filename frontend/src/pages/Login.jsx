import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, LogIn } from 'lucide-react';

export default function Login(){
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const submit = async (e) =>{
    e.preventDefault();
    setLoading(true); setError(null);
    try{
      await api.login(username, password);
      // inform app about auth change so App updates immediately
      window.dispatchEvent(new CustomEvent('authChanged'));
      // navigate to dashboard
      try { navigate('/'); } catch (e) { /* swallow navigate errors */ }
    }catch(err){
      setError(err.message || t('loginFailed'));
    }finally{ setLoading(false); }
  };

  useEffect(() => {
    // If already authenticated, redirect to dashboard
    if (api.getAccessToken()) {
      try { navigate('/'); } catch (e) {}
    }
    // Optionally listen for auth changes
    const onAuth = () => { if (api.getAccessToken()) { try { navigate('/'); } catch (e) {} } };
    window.addEventListener('authChanged', onAuth);
    return () => window.removeEventListener('authChanged', onAuth);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-primary-500/30 mb-4">Z</div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{t('zktecoAdmin')}</h1>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-800">{t('signIn')}</h2>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">{error}</div>
          )}

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('usernameLabel')}</label>
              <input
                autoFocus
                placeholder={t('enterUsername')}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-colors text-sm"
                value={username}
                onChange={e=>setUsername(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('passwordLabel')}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('enterPassword')}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-colors text-sm pr-12"
                  value={password}
                  onChange={e=>setPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center">
              <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} className="form-checkbox rounded text-primary-600" />
                <span>{t('rememberMe')}</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-primary-600 to-primary-500 text-white font-medium rounded-lg shadow-md shadow-primary-500/20 hover:shadow-lg hover:shadow-primary-500/30 hover:from-primary-700 hover:to-primary-600 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeOpacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round"/></svg>
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              <span>{loading ? t('signingIn') : t('signIn')}</span>
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">{t('copyright', { year: new Date().getFullYear() })}</p>
      </div>
    </div>
  );
}
