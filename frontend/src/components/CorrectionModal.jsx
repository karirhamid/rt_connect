import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, AlertTriangle } from 'lucide-react';
import api from '../services/api';

/**
 * Reusable correction modal.
 * Props:
 *  - mode: 'add' | 'edit' | 'delete'
 *  - employee: { id, name }
 *  - originalAttendanceId: required for edit/delete
 *  - defaultTimestamp: ISO string used to prefill the datetime input
 *  - defaultPunchType: 0 | 1
 *  - onClose: () => void
 *  - onSaved: () => void
 */
export default function CorrectionModal({ mode, employee, originalAttendanceId, defaultTimestamp, defaultPunchType = 0, onClose, onSaved }) {
  const { t } = useTranslation();
  const isDelete = mode === 'delete';

  const toLocal = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const tzAdj = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return tzAdj.toISOString().slice(0, 16);
  };

  const [timestamp, setTimestamp] = useState(toLocal(defaultTimestamp));
  const [punchType, setPunchType] = useState(defaultPunchType);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(employee || null);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    if (mode === 'add' && !employee) {
      api.getEmployees()
        .then((res) => {
          const list = Array.isArray(res) ? res : (res.employees || res.items || res.data || []);
          setEmployees(Array.isArray(list) ? list : []);
        })
        .catch(() => setEmployees([]));
    }
  }, [mode, employee]);

  const submit = async (e) => {
    e.preventDefault();
    if (!selectedEmployee) { setError(t('selectEmployee') || 'Sélectionnez un employé'); return; }
    if (reason.trim().length < 3) { setError(t('reasonRequired') || 'Motif requis (3 caractères min.)'); return; }
    if (!isDelete && !timestamp) { setError(t('timestampRequired') || 'Horodatage requis'); return; }
    setSubmitting(true);
    setError('');
    try {
      const body = {
        op: mode,
        employee_id: selectedEmployee.id,
        reason: reason.trim(),
        original_attendance_id: originalAttendanceId || null,
        new_timestamp: isDelete ? null : new Date(timestamp).toISOString(),
        new_punch_type: isDelete ? null : Number(punchType),
      };
      await api.post('/corrections', body);
      onSaved && onSaved();
      onClose && onClose();
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  const title = isDelete ? (t('deletePunch') || 'Supprimer le pointage')
    : mode === 'edit' ? (t('editPunch') || 'Modifier le pointage')
    : (t('addManualPunch') || 'Ajouter un pointage manuel');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded p-3 flex gap-2 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{selectedEmployee?.name || (t('noEmployeeSelected') || 'Aucun employé sélectionné')} — {t('correctionAuditNote') || "Cette action sera enregistrée dans le journal d'audit."}</span>
          </div>

          {mode === 'add' && !employee && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('employee') || 'Employé'}</label>
              <select required value={selectedEmployee?.id || ''} onChange={(e) => {
                const emp = employees.find(x => String(x.id) === e.target.value);
                setSelectedEmployee(emp || null);
              }} className="w-full px-3 py-2 border rounded text-sm">
                <option value="">— {t('selectEmployee') || 'Sélectionner'} —</option>
                {(Array.isArray(employees) ? employees : []).map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} {emp.user_id ? `(${emp.user_id})` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {!isDelete && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('timestamp') || 'Horodatage'}</label>
                <input type="datetime-local" required value={timestamp} onChange={(e) => setTimestamp(e.target.value)}
                       className="w-full px-3 py-2 border rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('punchType') || 'Type'}</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={Number(punchType) === 0} onChange={() => setPunchType(0)} /> {t('checkIn') || 'Entrée'}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={Number(punchType) === 1} onChange={() => setPunchType(1)} /> {t('checkOut') || 'Sortie'}
                  </label>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('reason') || 'Motif'} <span className="text-red-600">*</span></label>
            <textarea required value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                      placeholder={t('reasonPlaceholder') || "ex. Oubli de pointage, vérifié par téléphone."}
                      className="w-full px-3 py-2 border rounded text-sm" />
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">{t('cancel') || 'Annuler'}</button>
            <button type="submit" disabled={submitting}
                    className={`px-3 py-1.5 rounded text-sm text-white ${isDelete ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'} disabled:opacity-50`}>
              {submitting ? '...' : (isDelete ? (t('delete') || 'Supprimer') : (t('save') || 'Enregistrer'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
