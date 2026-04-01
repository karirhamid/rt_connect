import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Upload, Trash2, Plus, AlertCircle, CheckCircle, Loader } from 'lucide-react';
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
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [showConfirmRestore, setShowConfirmRestore] = useState(false);

  // Load backups on mount
  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackups = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/maintenance/backups');
      setBackups(response.data.backups || []);
      setTotalSize(response.data.total_size_mb || 0);
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t('maintenance')}</h1>
        <p className="text-gray-600 mt-1">{t('maintenanceDesc')}</p>
      </div>

      {/* Alerts */}
      {message && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-green-800">Success</h3>
            <p className="text-green-700 text-sm">{message}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-800">Error</h3>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Create Backup Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">{t('createNewBackup')}</h2>
        </div>
        <p className="text-gray-600 text-sm mb-4">
          {t('createBackupDesc')}
        </p>
        <button
          onClick={handleCreateBackup}
          disabled={creating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:bg-gray-400 transition"
        >
          {creating ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {creating ? t('creatingBackup') : t('createNewBackup')}
        </button>
      </div>

      {/* Backups List Section */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">{t('availableBackups')}</h2>
          <p className="text-gray-600 text-sm mt-1">
            {t('totalStorage')}: {totalSize} MB
          </p>
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
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">{t('filename')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">{t('created')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">{t('sizeLabel')}</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {backups.map((backup) => (
                  <tr key={backup.filename} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900 font-mono">{backup.filename}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(backup.created_at)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatBytes(backup.size_bytes)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDownload(backup.filename)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition"
                          title={t('download')}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedBackup(backup.filename);
                            setShowConfirmRestore(true);
                          }}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-md transition"
                          title={t('restore')}
                        >
                          <Upload className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteBackup(backup.filename)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-md transition"
                          title={t('delete')}
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

      {/* Restore Confirmation Modal */}
      {showConfirmRestore && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{t('confirmRestore')}</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-600">
                {t('confirmRestoreMsg')} <span className="font-mono font-semibold text-gray-900">{selectedBackup}</span>
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  <strong>{t('warningLabel')}:</strong> {t('restoreWarning')}
                </p>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => {
                  setShowConfirmRestore(false);
                  setSelectedBackup(null);
                }}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleRestoreBackup}
                disabled={restoring}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 transition-colors inline-flex items-center justify-center gap-2 font-medium text-sm"
              >
                {restoring ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {restoring ? t('restoring') : t('restore')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
