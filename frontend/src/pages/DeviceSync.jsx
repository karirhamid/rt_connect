import { useState, useEffect, useCallback } from 'react';
import { ArrowLeftRight, Users, Loader2, AlertCircle, CheckCircle, Copy, ChevronDown, Fingerprint, RefreshCw, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { Toast } from '../components/Dialog';
import SyncOverlay from '../components/SyncOverlay';

export default function DeviceSync() {
  const { t } = useTranslation();

  // All devices with their employee lists (from DB)
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Source / target selection
  const [sourceDeviceId, setSourceDeviceId] = useState('');
  const [targetDeviceId, setTargetDeviceId] = useState('');

  // Employee selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Copy operation state
  const [copying, setCopying] = useState(false);
  const [copyResults, setCopyResults] = useState(null);
  const [copyFingerprints, setCopyFingerprints] = useState(true);

  const [toast, setToast] = useState(null);
  const [syncOverlay, setSyncOverlay] = useState({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const resp = await api.authFetch('/api/employees/device-sync/devices-summary');
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || t('deviceSyncLoadError'));
      }
      const data = await resp.json();
      setDevices(data.devices || []);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // Reset selection when source changes
  useEffect(() => {
    setSelectedIds(new Set());
    setCopyResults(null);
  }, [sourceDeviceId]);

  const sourceDevice = devices.find(d => d.id === sourceDeviceId);
  const targetDevice = devices.find(d => d.id === targetDeviceId);

  const employees = sourceDevice?.employees || [];

  const allSelected = employees.length > 0 && employees.every(e => selectedIds.has(e.id));
  const someSelected = employees.some(e => selectedIds.has(e.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(employees.map(e => e.id)));
    }
  };

  const toggleEmployee = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopy = async () => {
    if (!sourceDeviceId || !targetDeviceId) return;
    if (selectedIds.size === 0) {
      showToast(t('deviceSyncSelectAtLeastOne'), 'error');
      return;
    }

    const tgtName = targetDevice?.name || '';
    setSyncOverlay({ visible: true, phase: 'syncing', deviceName: tgtName, direction: 'toDevice' });
    setCopyResults(null);
    try {
      const resp = await api.authFetch('/api/employees/device-sync/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_ids: Array.from(selectedIds),
          target_device_id: targetDeviceId,
          copy_fingerprints: copyFingerprints,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.detail || t('deviceSyncCopyFailed'));
      }
      setCopyResults(data);
      const hasErrors = data.failed > 0;
      setSyncOverlay({ visible: true, phase: hasErrors ? 'error' : 'done', deviceName: tgtName, direction: 'toDevice' });
      await new Promise(r => setTimeout(r, 1000));
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });
      if (data.failed === 0) {
        showToast(t('deviceSyncCopySuccess', { count: data.success }), 'success');
      } else {
        showToast(
          t('deviceSyncCopyPartial', { success: data.success, failed: data.failed }),
          'warning'
        );
      }
    } catch (e) {
      setSyncOverlay({ visible: true, phase: 'error', deviceName: tgtName, direction: 'toDevice' });
      await new Promise(r => setTimeout(r, 1200));
      setSyncOverlay({ visible: false, phase: 'syncing', deviceName: '', direction: 'toDevice' });
      showToast(e.message, 'error');
    }
  };

  const privilegeLabel = (priv) => {
    if (priv === 14) return t('admin') || 'Admin';
    return t('user') || 'User';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-red-600">
        <AlertCircle className="w-8 h-8" />
        <p>{loadError}</p>
        <button
          onClick={loadDevices}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 text-gray-700"
        >
          <RefreshCw className="w-4 h-4" />
          {t('retry') || 'Retry'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <SyncOverlay visible={syncOverlay.visible} phase={syncOverlay.phase} deviceName={syncOverlay.deviceName} direction={syncOverlay.direction} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-blue-600" />
            {t('deviceSyncTitle')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{t('deviceSyncSubtitle')}</p>
        </div>
        <button
          onClick={loadDevices}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 text-gray-700"
          title={t('refresh') || 'Refresh'}
        >
          <RefreshCw className="w-4 h-4" />
          {t('refresh') || 'Refresh'}
        </button>
      </div>

      {/* Main layout: two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Left panel: Source device + employee list ── */}
        <div className="bg-white border rounded-xl shadow-sm flex flex-col">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-500" />
              {t('deviceSyncSource')}
            </h2>
          </div>

          <div className="px-6 py-4 space-y-4 flex-1">
            {/* Source device selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('deviceSyncSelectSource')}
              </label>
              <div className="relative">
                <select
                  value={sourceDeviceId}
                  onChange={e => setSourceDeviceId(e.target.value)}
                  className="w-full appearance-none border rounded-lg px-3 py-2 pr-8 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{t('deviceSyncChooseDevice')}</option>
                  {devices.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.employee_count} {t('employees') || 'employees'})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Employee list */}
            {sourceDeviceId && employees.length === 0 && (
              <p className="text-sm text-gray-500 py-4 text-center">{t('noEmployeesFound') || 'No employees found'}</p>
            )}

            {employees.length > 0 && (
              <div className="space-y-2">
                {/* Select all row */}
                <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer border-b pb-3 mb-1">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    {allSelected ? t('deviceSyncDeselectAll') : t('deviceSyncSelectAll')}
                  </span>
                  <span className="ml-auto text-xs text-gray-400">
                    {selectedIds.size}/{employees.length}
                  </span>
                </label>

                {/* Scrollable employee list */}
                <div className="max-h-96 overflow-y-auto space-y-1 pr-1">
                  {employees.map(emp => (
                    <label
                      key={emp.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(emp.id)}
                        onChange={() => toggleEmployee(emp.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{emp.name}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {emp.department_name && `${emp.department_name} · `}
                          ID {emp.user_id}
                          {emp.privilege === 14 && (
                            <span className="ml-1 px-1 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">
                              {privilegeLabel(emp.privilege)}
                            </span>
                          )}
                        </p>
                      </div>
                      <Fingerprint className="w-4 h-4 text-gray-300 flex-shrink-0" title={t('deviceSyncHasFingerprints') || 'May have fingerprints'} />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel: Target device + copy button + results ── */}
        <div className="bg-white border rounded-xl shadow-sm flex flex-col">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <Copy className="w-5 h-5 text-gray-500" />
              {t('deviceSyncTarget')}
            </h2>
          </div>

          <div className="px-6 py-4 space-y-4 flex-1">
            {/* Target device selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('deviceSyncSelectTarget')}
              </label>
              <div className="relative">
                <select
                  value={targetDeviceId}
                  onChange={e => setTargetDeviceId(e.target.value)}
                  className="w-full appearance-none border rounded-lg px-3 py-2 pr-8 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{t('deviceSyncChooseDevice')}</option>
                  {devices
                    .filter(d => d.id !== sourceDeviceId)
                    .map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.employee_count} {t('employees') || 'employees'})
                      </option>
                    ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Summary + copy button */}
            {sourceDeviceId && targetDeviceId && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <div className="text-sm text-blue-800">
                  <span className="font-semibold">{selectedIds.size}</span>{' '}
                  {t('deviceSyncWillCopy')}
                  {' '}
                  <span className="font-semibold">{targetDevice?.name}</span>
                </div>

                {/* Fingerprint toggle */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={copyFingerprints}
                      onChange={e => setCopyFingerprints(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-300 peer-checked:bg-blue-600 rounded-full transition-colors" />
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                  </div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <Fingerprint className={`w-4 h-4 ${copyFingerprints ? 'text-blue-600' : 'text-gray-400'}`} />
                    <span className={copyFingerprints ? 'text-blue-800 font-medium' : 'text-gray-600'}>
                      {t('deviceSyncIncludeFingerprints')}
                    </span>
                  </div>
                </label>

                {!copyFingerprints && (
                  <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                    <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{t('deviceSyncProfileOnlyNote')}</span>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleCopy}
              disabled={copying || !sourceDeviceId || !targetDeviceId || selectedIds.size === 0}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg transition-colors"
            >
              {copying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('deviceSyncCopying')}
                </>
              ) : (
                <>
                  <ArrowLeftRight className="w-4 h-4" />
                  {t('deviceSyncCopyButton', { count: selectedIds.size })}
                </>
              )}
            </button>

            {/* Results */}
            {copyResults && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-4 text-sm font-medium">
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    {copyResults.success} {t('deviceSyncSuccess') || 'succeeded'}
                  </span>
                  {copyResults.failed > 0 && (
                    <span className="flex items-center gap-1 text-red-600">
                      <AlertCircle className="w-4 h-4" />
                      {copyResults.failed} {t('deviceSyncFailed') || 'failed'}
                    </span>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto space-y-1 border rounded-lg divide-y text-sm">
                  {copyResults.results.map(r => (
                    <div
                      key={r.employee_id}
                      className={`flex items-start gap-3 px-3 py-2 ${r.success ? 'bg-white' : 'bg-red-50'}`}
                    >
                      {r.success ? (
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{r.name}</p>
                        {r.success ? (
                          <p className="text-xs text-gray-500">
                            {r.fingerprints_copied > 0
                              ? t('deviceSyncFpCopied', { count: r.fingerprints_copied })
                              : !copyFingerprints
                                ? t('deviceSyncFpPreserved')
                                : t('deviceSyncNoFp')}
                            {r.uid_changed && (
                              <span className="ml-1 text-amber-600">
                                {' '}· {t('deviceSyncAssignedSlot') || 'Assigned to slot'} #{r.assigned_uid}
                              </span>
                            )}
                          </p>
                        ) : (
                          <p className="text-xs text-red-600 break-words">{r.error}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
