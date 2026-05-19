import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileSpreadsheet, FileText, Calendar } from 'lucide-react';
import api from '../services/api';

export default function PayrollExport() {
  const { t } = useTranslation();
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const todayISO = today.toISOString().slice(0, 10);

  const [start, setStart] = useState(firstOfMonth);
  const [end, setEnd] = useState(todayISO);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const download = async (path, params, filename) => {
    setBusy(filename);
    setError('');
    try {
      const res = await api.get(path, { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Erreur');
    } finally {
      setBusy('');
    }
  };

  const cards = [
    {
      key: 'csv',
      title: t('exportCSV') || 'CSV générique',
      desc: t('exportCSVDesc') || 'Une ligne par employé par jour. UTF-8 + BOM (ouvre directement dans Excel).',
      icon: FileText,
      action: () => download('/api/payroll-export/csv', { start_date: start, end_date: end }, `payroll_${start}_${end}.csv`),
    },
    {
      key: 'xlsx',
      title: t('exportXLSX') || 'Excel (XLSX) avec totaux',
      desc: t('exportXLSXDesc') || 'Classeur formaté avec en-tête couleur et ligne de totaux.',
      icon: FileSpreadsheet,
      action: () => download('/api/payroll-export/xlsx', { start_date: start, end_date: end }, `payroll_${start}_${end}.xlsx`),
    },
    {
      key: 'sage',
      title: t('exportSage') || 'Sage Paie Maroc',
      desc: t('exportSageDesc') || 'Format MATRICULE;RUBRIQUE;QUANTITE;DATE_DEBUT;DATE_FIN. Rubriques HEUR (heures normales), HSUP (sup.), RTRD (retard, min).',
      icon: FileText,
      action: () => download('/api/payroll-export/sage-paie', { start_date: start, end_date: end }, `sage_paie_${start}_${end}.csv`),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('payrollExport') || 'Export Paie'}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t('payrollExportDesc') || "Exports prêts pour l'intégration paie. Les corrections HR sont incluses, les pointages annulés sont exclus."}
        </p>
      </div>

      <div className="bg-white border rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('startDate') || 'Date de début'}</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
                 className="w-full px-3 py-2 border rounded text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('endDate') || 'Date de fin'}</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
                 className="w-full px-3 py-2 border rounded text-sm" />
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <div key={c.key} className="bg-white border rounded-lg p-4 flex flex-col">
              <Icon className="w-8 h-8 text-primary-600 mb-2" />
              <h3 className="font-semibold mb-1">{c.title}</h3>
              <p className="text-sm text-gray-600 flex-1 mb-3">{c.desc}</p>
              <button onClick={c.action} disabled={!!busy}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 text-sm">
                <Download className="w-4 h-4" />
                {busy === c.key ? '...' : (t('download') || 'Télécharger')}
              </button>
            </div>
          );
        })}
      </div>

      <div className="bg-white border rounded-lg p-4 mt-6">
        <h3 className="font-semibold mb-3">{t('monthlyPDF') || 'Récapitulatif PDF mensuel'}</h3>
        <p className="text-sm text-gray-600 mb-3">
          {t('monthlyPDFDesc') || "Un PDF par mois avec une ligne par employé : jours travaillés, total heures, sup., retards, départs anticipés."}
        </p>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('year') || 'Année'}</label>
            <input type="number" min="2020" max="2099" value={year} onChange={(e) => setYear(parseInt(e.target.value) || today.getFullYear())}
                   className="w-24 px-3 py-2 border rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('month') || 'Mois'}</label>
            <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}
                    className="px-3 py-2 border rounded text-sm">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
            </select>
          </div>
          <button onClick={() => download('/api/payroll-export/monthly-pdf', { year, month }, `monthly_${year}_${String(month).padStart(2, '0')}.pdf`)}
                  disabled={!!busy}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 text-sm">
            <Download className="w-4 h-4" /> {t('download') || 'Télécharger'}
          </button>
        </div>
      </div>
    </div>
  );
}
