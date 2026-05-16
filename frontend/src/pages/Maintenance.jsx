import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Upload, Trash2, Plus, AlertCircle, CheckCircle, Loader, Database, FileUp,
         Server, Eye, EyeOff, ShieldCheck, CloudOff } from 'lucide-react';
import api from '../services/api';

export default function Maintenance() {
  const { t } = useTranslation();
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [totalSize, setTotalSize] = useState(0);
  const [pgDumpAvailable, setPgDumpAvailable] = useState(true);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [showConfirmRestore, setShowConfirmRestore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // External storage state
  const [extType, setExtType] = useState('none');
  const [smb, setSmb] = useState({ server: '', share: '', username: '', password: '', domain: '', remote_path: 'rtpointage' });
  const [smbShowPwd, setSmbShowPwd] = useState(false);
  const [savingStorage, setSavingStorage] = useState(false);
  const [testingStorage, setTestingStorage] = useState(false);
  const [storageMsg, setStorageMsg] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyingFor, setVerifyingFor] = useState(null);

  // Load backups + storage config on mount
  useEffect(() => {
    loadBackups();
    loadStorageConfig();
  }, []);

  const loadStorageConfig = async () => {
    try {
      const { data } = await api.get('/maintenance/storage');
      setExtType(data.type || 'none');
      if (data.type === 'smb' && data.config) {
        setSmb({
          server:      data.config.server      || '',
          share:       data.config.share       || '',
          username:    data.config.username    || '',
          password:    data.config.password    || '',  // masked from server
          domain:      data.config.domain      || '',
          remote_path: data.config.remote_path || 'rtpointage',
        });
      }
    } catch (e) {
      // Non-fatal — section just shows defaults
    }
  };

  const _smbPayload = () => ({
    type: extType,
    smb: extType === 'smb' ? {
      server: smb.server.trim(),
      share:  smb.share.trim(),
      username: smb.username.trim(),
      // Send password only if user typed a new one (not the mask)
      password: (smb.password && !smb.password.startsWith('••')) ? smb.password : null,
      domain: smb.domain.trim() || null,
      remote_path: smb.remote_path.trim() || 'rtpointage',
    } : null,
  });

  const saveStorage = async () => {
    setSavingStorage(true);
    setStorageMsg(null);
    try {
      await api.put('/maintenance/storage', _smbPayload());
      setStorageMsg({ kind: 'ok', text: t('storageSaved') || 'Configuration enregistrée' });
      loadStorageConfig();
      loadBackups();  // refresh list to show remote files
    } catch (err) {
      setStorageMsg({ kind: 'err', text: err.response?.data?.detail || err.message });
    } finally {
      setSavingStorage(false);
    }
  };

  const testStorage = async () => {
    setTestingStorage(true);
    setStorageMsg(null);
    try {
      const { data } = await api.post('/maintenance/storage/test', _smbPayload());
      setStorageMsg({ kind: data.ok ? 'ok' : 'err', text: data.message });
    } catch (err) {
      setStorageMsg({ kind: 'err', text: err.response?.data?.detail || err.message });
    } finally {
      setTestingStorage(false);
    }
  };

  const verifyBackup = async (filename) => {
    setVerifyingFor(filename);
    setVerifyResult(null);
    try {
      const { data } = await api.get(`/maintenance/backup/${encodeURIComponent(filename)}/verify`);
      setVerifyResult({ filename, ...data });
    } catch (err) {
      setVerifyResult({ filename, valid: false, message: err.response?.data?.detail || err.message });
    } finally {
      setVerifyingFor(null);
    }
  };

  const loadBackups = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/maintenance/backups');
      setBackups(response.data.backups || []);
      setTotalSize(response.data.total_size_mb || 0);
      setPgDumpAvailable(response.data.pg_dump_available !== false);
    } catch (err) {
      setError(err.response?.data?.detail || t('failedToLoadBackups'));
      setBackups([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    setCreating(true);
    setError(null);
    setMessage(null);
    try {
      const response = await api.post('/maintenance/backup');
      setMessage(`${t('backupCreated')}: ${response.data.filename}`);
      await loadBackups();
    } catch (err) {
      setError(err.response?.data?.detail || t('failedToCreateBackup'));
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (filename) => {
    try {
      const response = await api.get(`/maintenance/backup/${filename}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.detail || t('failedToDeleteBackup'));
    }
  };

  const handleRestoreBackup = async () => {
    if (!selectedBackup) return;

    setRestoring(true);
    setError(null);
    setMessage(null);
    try {
      const response = await api.post(`/maintenance/restore/${selectedBackup}`);
      setMessage(t('backupRestored'));
      setShowConfirmRestore(false);
      setSelectedBackup(null);
      await loadBackups();
    } catch (err) {
      setError(err.response?.data?.detail || t('failedToRestoreBackup'));
    } finally {
      setRestoring(false);
    }
  };

  const handleUploadAndRestore = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Browser confirm — restore is destructive
    if (!window.confirm(
      t('confirmUploadRestore') ||
      `Restore the database from "${file.name}"? This will REPLACE all current data.`
    )) {
      event.target.value = '';
      return;
    }

    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.append('file', file);
      // Use raw fetch — api.post serializes JSON; FormData needs multipart
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL ?? ''}/api/maintenance/restore-upload`,
        {
          method: 'POST',
          body: form,
          headers: { Authorization: `Bearer ${api.getAccessToken()}` },
          credentials: 'include',
        }
      );
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.detail || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setMessage(`${t('backupRestored') || 'Restored'}: ${data.restored_from}`);
      await loadBackups();
    } catch (err) {
      setError(err.message || (t('failedToRestoreBackup') || 'Restore failed'));
    } finally {
      setUploading(false);
      if (event.target) event.target.value = '';
    }
  };

  const handleDeleteBackup = async (filename) => {
    if (!window.confirm(t('confirmDeleteBackup'))) return;

    try {
      await api.delete(`/maintenance/backup/${filename}`);
      setMessage(`${t('backupDeleted')}: ${filename}`);
      await loadBackups();
    } catch (err) {
      setError(err.response?.data?.detail || t('failedToDeleteBackup'));
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight" style={{ letterSpacing: '-0.02em' }}>
          {t('maintenance')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('maintenanceDesc') || 'Sauvegarde et restauration de la base de données (toutes les données + configuration).'}
        </p>
      </div>

      {/* pg_dump missing warning */}
      {!pgDumpAvailable && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <h3 className="font-semibold text-amber-800">
              {t('pgDumpMissing') || 'pg_dump n\'est pas disponible'}
            </h3>
            <p className="text-amber-700 mt-1">
              {t('pgDumpMissingDesc') ||
                "Le backend ne peut pas créer de nouvelles sauvegardes. Installez le paquet « postgresql-client » dans le Dockerfile et reconstruisez l'image."}
            </p>
          </div>
        </div>
      )}

      {/* Alerts */}
      {message && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-emerald-800 text-sm">{message}</p>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Backup + Restore actions — side-by-side cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Create backup */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
              <Database className="w-5 h-5 text-slate-700" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">{t('createNewBackup') || 'Créer une sauvegarde'}</h2>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            {t('createBackupDesc') ||
              'Sauvegarde complète : schéma, données, configurations, utilisateurs. Compatible PostgreSQL 16+.'}
          </p>
          <button
            onClick={handleCreateBackup}
            disabled={creating || !pgDumpAvailable}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5
                       bg-slate-900 text-white rounded-lg hover:bg-slate-800 active:bg-black
                       disabled:bg-slate-300 disabled:cursor-not-allowed
                       transition-colors font-medium text-sm"
          >
            {creating ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {creating ? (t('creatingBackup') || 'Sauvegarde…') : (t('createNewBackup') || 'Créer une sauvegarde')}
          </button>
        </div>

        {/* Upload + restore */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
              <FileUp className="w-5 h-5 text-slate-700" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">{t('restoreFromFile') || 'Restaurer depuis un fichier'}</h2>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            {t('restoreFromFileDesc') ||
              "Importer une sauvegarde .dump ou .json.gz d'un autre serveur. Remplace toutes les données."}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".dump,.gz,.json,.json.gz"
            onChange={handleUploadAndRestore}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5
                       border border-slate-300 text-slate-800 rounded-lg
                       hover:bg-slate-50 active:bg-slate-100
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors font-medium text-sm"
          >
            {uploading ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? (t('uploadingRestoring') || 'Restauration…') : (t('chooseBackupFile') || 'Choisir un fichier')}
          </button>
        </div>

      </div>

      {/* ── External backup storage (SMB / network share) ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <Server className="w-5 h-5 text-slate-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">
              {t('externalStorage') || 'Stockage externe'}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {t('externalStorageDesc') ||
                "Pousser automatiquement chaque sauvegarde vers un partage réseau. La copie locale est toujours conservée."}
            </p>
          </div>
        </div>

        {/* Storage type selector */}
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'none', label: t('storageNone') || 'Aucun (local seulement)', icon: CloudOff },
            { value: 'smb',  label: t('storageSmb')  || 'SMB / Partage réseau',    icon: Server  },
          ].map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => { setExtType(value); setStorageMsg(null); }}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                extType === value
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* SMB config form */}
        {extType === 'smb' && (
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {t('smbServer') || 'Serveur'} *
              </label>
              <input value={smb.server} onChange={e => setSmb({ ...smb, server: e.target.value })}
                placeholder="192.168.1.50 ou nas.local"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-slate-300 focus:border-slate-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {t('smbShare') || 'Nom du partage'} *
              </label>
              <input value={smb.share} onChange={e => setSmb({ ...smb, share: e.target.value })}
                placeholder="backups"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-slate-300 focus:border-slate-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {t('smbUsername') || 'Utilisateur'} *
              </label>
              <input value={smb.username} onChange={e => setSmb({ ...smb, username: e.target.value })}
                autoComplete="off"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-slate-300 focus:border-slate-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {t('smbPassword') || 'Mot de passe'} *
              </label>
              <div className="relative">
                <input type={smbShowPwd ? 'text' : 'password'}
                  value={smb.password} onChange={e => setSmb({ ...smb, password: e.target.value })}
                  placeholder={smb.password.startsWith('••') ? (t('keepCurrentPassword') || 'Laisser pour conserver') : ''}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 pr-10 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-slate-300 focus:border-slate-400" />
                <button type="button" onClick={() => setSmbShowPwd(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {smbShowPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {t('smbDomain') || 'Domaine'} <span className="text-slate-400">(optionnel)</span>
              </label>
              <input value={smb.domain} onChange={e => setSmb({ ...smb, domain: e.target.value })}
                placeholder="WORKGROUP"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-slate-300 focus:border-slate-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {t('smbRemotePath') || 'Sous-dossier dans le partage'}
              </label>
              <input value={smb.remote_path} onChange={e => setSmb({ ...smb, remote_path: e.target.value })}
                placeholder="rtpointage"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-slate-300 focus:border-slate-400" />
            </div>
          </div>
        )}

        {/* Status message */}
        {storageMsg && (
          <div className={`text-sm px-3 py-2 rounded-lg border ${
            storageMsg.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}>
            {storageMsg.text}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 justify-end">
          {extType === 'smb' && (
            <button onClick={testStorage} disabled={testingStorage}
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-800 rounded-lg
                         hover:bg-slate-50 disabled:opacity-50 text-sm font-medium">
              {testingStorage ? <Loader className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {t('testConnection') || 'Tester la connexion'}
            </button>
          )}
          <button onClick={saveStorage} disabled={savingStorage}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800
                       disabled:bg-slate-300 text-sm font-medium">
            {savingStorage ? <Loader className="w-4 h-4 animate-spin" /> : null}
            {t('save') || 'Enregistrer'}
          </button>
        </div>
      </div>

      {/* Backups List Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 overflow-hidden">
        <div className="p-6 border-b border-slate-200/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t('availableBackups') || 'Sauvegardes disponibles'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {backups.length} {(t('files') || 'fichier(s)')} · {totalSize} MB {(t('total') || 'au total')}
            </p>
          </div>
          <button
            onClick={loadBackups}
            disabled={loading}
            className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 self-start"
          >
            {loading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : null}
            {t('refresh') || 'Actualiser'}
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <Loader className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
            <p className="text-gray-600 mt-2">{t('loadingBackups')}</p>
          </div>
        ) : backups.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>{t('noBackupsAvailable')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/70 border-b border-slate-200/60">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('filename') || 'Fichier'}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider hidden sm:table-cell">{t('format') || 'Format'}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider hidden md:table-cell">{t('created') || 'Créé le'}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('sizeLabel') || 'Taille'}</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('actions') || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {backups.map((backup) => (
                  <tr key={backup.filename} className="hover:bg-slate-50/60">
                    <td className="px-6 py-3 text-sm text-slate-900 font-mono text-xs">{backup.filename}</td>
                    <td className="px-6 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wider ${
                          backup.format === 'pgdump'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {backup.format === 'pgdump' ? 'pg_dump' : 'legacy'}
                        </span>
                        {backup.source && backup.source !== 'local' && (
                          <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wider
                                          bg-sky-50 text-sky-700 border border-sky-200">
                            {backup.source}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-600 hidden md:table-cell">{formatDate(backup.created_at)}</td>
                    <td className="px-6 py-3 text-sm text-slate-600">{formatBytes(backup.size_bytes)}</td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => verifyBackup(backup.filename)}
                          disabled={verifyingFor === backup.filename}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-50"
                          title={t('verifyBackup') || 'Vérifier l\'intégrité'}
                        >
                          {verifyingFor === backup.filename
                            ? <Loader className="w-4 h-4 animate-spin" />
                            : <ShieldCheck className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDownload(backup.filename)}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                          title={t('download') || 'Télécharger'}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setSelectedBackup(backup.filename); setShowConfirmRestore(true); }}
                          className="p-2 text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors"
                          title={t('restore') || 'Restaurer'}
                        >
                          <Upload className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteBackup(backup.filename)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                          title={t('delete') || 'Supprimer'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Verify result modal */}
      {verifyResult && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
             onClick={() => setVerifyResult(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
              {verifyResult.valid
                ? <CheckCircle className="w-5 h-5 text-emerald-600" />
                : <AlertCircle className="w-5 h-5 text-red-600" />}
              <h2 className="text-lg font-semibold text-slate-900">
                {verifyResult.valid
                  ? (t('verifyOk') || 'Sauvegarde valide')
                  : (t('verifyFail') || 'Sauvegarde corrompue')}
              </h2>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="font-mono text-xs text-slate-500 break-all">{verifyResult.filename}</p>
              <p className="text-sm text-slate-700">{verifyResult.message}</p>
              {verifyResult.valid && verifyResult.table_count > 0 && (
                <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-slate-500">{t('tablesCount') || 'Tables'} :</span> <span className="font-semibold">{verifyResult.table_count}</span></div>
                  {verifyResult.sequence_count > 0 && (
                    <div className="flex justify-between"><span className="text-slate-500">{t('sequencesCount') || 'Séquences'} :</span> <span className="font-semibold">{verifyResult.sequence_count}</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-slate-500">{t('itemsCount') || 'Entrées totales'} :</span> <span className="font-semibold">{verifyResult.item_count}</span></div>
                  {verifyResult.sample_tables?.length > 0 && (
                    <div className="pt-2 border-t border-slate-200">
                      <div className="text-xs text-slate-500 mb-1">{t('sampleTables') || 'Exemples de tables'} :</div>
                      <div className="flex flex-wrap gap-1">
                        {verifyResult.sample_tables.map(name => (
                          <code key={name} className="text-[11px] bg-white border border-slate-200 px-1.5 py-0.5 rounded">{name}</code>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl text-right">
              <button onClick={() => setVerifyResult(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-sm font-medium">
                {t('close') || 'Fermer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {showConfirmRestore && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">{t('confirmRestore') || 'Confirmer la restauration'}</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-600">
                {t('confirmRestoreMsg') || 'Restaurer depuis :'}
                <span className="font-mono font-semibold text-slate-900 ml-1 text-xs break-all">{selectedBackup}</span>
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800">
                  <strong>{t('warningLabel') || 'Attention'} :</strong> {t('restoreWarning') ||
                    'Toutes les données actuelles seront remplacées par celles de la sauvegarde.'}
                </p>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button
                onClick={() => { setShowConfirmRestore(false); setSelectedBackup(null); }}
                className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors font-medium text-sm"
              >
                {t('cancel') || 'Annuler'}
              </button>
              <button
                onClick={handleRestoreBackup}
                disabled={restoring}
                className="flex-1 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg
                           disabled:bg-slate-400 transition-colors inline-flex items-center justify-center gap-2 font-medium text-sm"
              >
                {restoring ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {restoring ? (t('restoring') || 'Restauration…') : (t('restore') || 'Restaurer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
