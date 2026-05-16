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
  const [branding, setBranding] = useState({ app_name: 'RTPointage', client_name: null });
  const navigate = useNavigate();

  const submit = async (e) =>{
    e.preventDefault();
    setLoading(true); setError(null);
    try{
      await api.login(username, password);
      window.dispatchEvent(new CustomEvent('authChanged'));
      try { navigate('/'); } catch (e) { /* swallow */ }
    }catch(err){
      setError(err.message || t('loginFailed'));
    }finally{ setLoading(false); }
  };

  useEffect(() => {
    // Redirect if already authenticated
    if (api.getAccessToken()) { try { navigate('/'); } catch (e) {} }
    const onAuth = () => { if (api.getAccessToken()) { try { navigate('/'); } catch (e) {} } };
    window.addEventListener('authChanged', onAuth);

    // Fetch branding (app name + client name)
    api.getPublicBranding().then(setBranding).catch(() => {});

    return () => window.removeEventListener('authChanged', onAuth);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center
                    bg-gradient-to-br from-slate-100 via-white to-slate-100
                    p-4 sm:p-6">
      <div className="w-full max-w-md">

        {/* ── Header: app name + client name ── */}
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900"
              style={{ letterSpacing: '-0.02em' }}>
            <span className="text-slate-900">RT</span>
            <span className="text-slate-500 font-light">Pointage</span>
          </h1>

          {branding.client_name && (
            <p className="mt-2 text-sm text-slate-500 tracking-wide uppercase">
              {branding.client_name}
            </p>
          )}
        </div>

        {/* ── Login card ── */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200/60 p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-800">{t('signIn')}</h2>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('usernameLabel')}
              </label>
              <input
                autoFocus
                placeholder={t('enterUsername')}
                className="w-full px-4 py-3 border border-slate-200 rounded-lg bg-slate-50
                           focus:bg-white focus:ring-2 focus:ring-slate-300 focus:border-slate-400
                           transition-colors text-sm"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('passwordLabel')}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('enterPassword')}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg bg-slate-50
                             focus:bg-white focus:ring-2 focus:ring-slate-300 focus:border-slate-400
                             transition-colors text-sm pr-12"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button type="button"
                        onClick={() => setShowPassword(s => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        tabIndex={-1}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
              <input type="checkbox"
                     checked={remember}
                     onChange={e => setRemember(e.target.checked)}
                     className="form-checkbox rounded text-slate-900 focus:ring-slate-400" />
              <span>{t('rememberMe')}</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-5 py-3
                         bg-slate-900 hover:bg-slate-800 active:bg-black
                         text-white font-medium rounded-lg shadow-md shadow-slate-900/20
                         transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeOpacity="0.3"/>
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round"/>
                </svg>
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              <span>{loading ? t('signingIn') : t('signIn')}</span>
            </button>
          </form>
        </div>

        {/* ── Footer ── */}
        <div className="mt-6 text-center text-xs text-slate-400 space-y-1">
          <p>{t('copyright', { year: new Date().getFullYear(), app: branding.app_name || 'RTPointage' })}</p>
        </div>
      </div>
    </div>
  );
}
