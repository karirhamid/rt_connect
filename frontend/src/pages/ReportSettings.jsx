import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, FileText, Loader2, AlertCircle, CheckCircle, Info } from 'lucide-react';
import api from '../services/api';

/**
 * Settings → Rapports
 *
 * Super-admin-only panel that toggles optional reporting modules.
 * Today only one toggle lives here: the lateness reports module. As we
 * add more report modules (per-employee timeline, lateness email
 * template, etc.) they'll each get their own card here.
 *
 * The flag is read from /api/settings/reports-module (any settings-manager
 * can SEE the state — only roles.manage can change it).
 */
export default function ReportSettings() {
  const { t } = useTranslation();
  const canEdit = (() => {
    try { return JSON.parse(localStorage.getItem('_userPerms') || '[]').includes('roles.manage'); }
    catch { return false; }
  })();

  const [latenessEnabled, setLatenessEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'ok'|'err', msg }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await api.authFetch('/api/settings/reports-module', { method: 'GET' });
        if (resp.ok) {
          const data = await resp.json();
          if (!cancelled) setLatenessEnabled(!!data.lateness_module_enabled);
        }
      } catch (e) { console.error(e); }
      finally { if (!cancelled) setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    if (!canEdit) return;
    setSaving(true); setToast(null);
    try {
      const resp = await api.authFetch('/api/settings/reports-module', {
        method: 'PUT',
        body: JSON.stringify({ lateness_module_enabled: latenessEnabled }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${resp.status}`);
      }
      setToast({ type: 'ok', msg: t('settingsSaved') || 'Paramètres enregistrés' });
    } catch (e) {
      setToast({ type: 'err', msg: e.message || 'Save failed' });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3500);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('reportSettingsTitle') || 'Paramètres des rapports'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('reportSettingsSubtitle')
              || 'Activez ou désactivez les modules de rapports optionnels. Seul un super administrateur peut modifier ces réglages.'}
          </p>
        </div>
      </div>

      {!canEdit && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {t('readonlyForNonSuperAdmin')
              || 'Lecture seule — seul un super administrateur peut modifier ces réglages.'}
          </span>
        </div>
      )}

      {/* Lateness module card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-5 border-b border-gray-100 flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">
              {t('latenessModuleTitle') || 'Module de rapports — Retards'}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {t('latenessModuleDesc')
                || "Active l'onglet « Retards » sur la page Rapports et le classement des retards par employé sur une période."}
            </p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <label className={`flex items-center gap-3 ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
            <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              latenessEnabled ? 'bg-primary-600' : 'bg-gray-300'
            } ${!canEdit ? 'opacity-60' : ''}`}>
              <input
                type="checkbox"
                className="sr-only"
                checked={latenessEnabled}
                disabled={!canEdit || !loaded}
                onChange={(e) => setLatenessEnabled(e.target.checked)}
              />
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                latenessEnabled ? 'translate-x-5' : 'translate-x-1'
              }`}/>
            </span>
            <div className="text-sm">
              <div className="font-medium text-gray-900">
                {latenessEnabled
                  ? (t('enabled') || 'Activé')
                  : (t('disabled') || 'Désactivé')}
              </div>
              <div className="text-xs text-gray-500">
                {t('latenessModuleHint')
                  || "Calcul minute-précis : un employé qui pointe à 9h01 alors qu'il devait commencer à 9h compte 1 min de retard."}
              </div>
            </div>
          </label>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100 text-blue-900 text-xs">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {t('latenessModuleInfo')
                || "Heure de référence : EmployeeSchedule → DepartmentSchedule. Les jours fériés, jours de repos et absences n'entrent pas dans le calcul."}
            </span>
          </div>
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 rounded-b-xl flex justify-end gap-2">
          <button
            onClick={save}
            disabled={!canEdit || saving || !loaded}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('save') || 'Enregistrer'}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm ${
          toast.type === 'ok'
            ? 'bg-emerald-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
