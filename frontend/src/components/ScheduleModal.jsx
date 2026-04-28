import { useState, useEffect, useRef } from 'react';
import { X, ChevronRight, ChevronLeft, Plus, Trash2, Check, Mail } from 'lucide-react';
import api from '../services/api';

// ── Constants ────────────────────────────────────────────────────────────────

const DAYS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const DATA_PERIOD_OPTIONS = {
  daily:        [{ v: 'today', l: "Aujourd'hui" }, { v: 'yesterday', l: 'Hier' }],
  weekly:       [{ v: 'current_week', l: 'Semaine courante (lun → auj.)' }, { v: 'last_week', l: 'Semaine dernière (lun–dim)' }],
  monthly_day:  [{ v: 'current_month', l: 'Mois courant' }, { v: 'last_month', l: 'Mois dernier' }],
  monthly_last: [{ v: 'current_month', l: 'Mois courant' }, { v: 'last_month', l: 'Mois dernier' }],
};

const DEFAULT_PERIOD = {
  daily: 'yesterday', weekly: 'current_week',
  monthly_day: 'last_month', monthly_last: 'last_month',
};

// Ready-to-use email templates (plain paragraph style)
// bodyFn(scheduleType) allows dynamic content per frequency type
const _PROF_BODY = (type) => {
  const periodLine = type === 'daily'
    ? `<p>Merci de trouver en pièce jointe le rapport de présence du <strong>{{report_date}}</strong>.</p>`
    : `<p>Merci de trouver en pièce jointe le rapport de présence pour la période du <strong>{{period_label}}</strong>.</p>`;
  return `<p>Bonjour,</p>

${periodLine}

<p>
  Récapitulatif :<br>
  — Employés actifs : <strong>{{total_employees}}</strong><br>
  — Total des enregistrements : <strong>{{total_records}}</strong><br>
  — Date de génération : <strong>{{generated_at}}</strong>
</p>

<p>Ce rapport est généré automatiquement. Merci de ne pas y répondre directement.</p>

<p>Bien cordialement,<br><strong>{{company_name}}</strong> — Système RT Connect</p>`;
};

const _SIMPLE_BODY = (type) => {
  const periodLine = type === 'daily'
    ? `<p>Veuillez trouver ci-joint le rapport de présence du <strong>{{report_date}}</strong>.</p>`
    : `<p>Veuillez trouver ci-joint le rapport de présence pour la période du <strong>{{period_label}}</strong>.</p>`;
  return `<p>Bonjour,</p>

${periodLine}

<p>
  Employés concernés : <strong>{{total_employees}}</strong><br>
  Enregistrements : <strong>{{total_records}}</strong><br>
  Généré le : {{generated_at}}
</p>

<p>Cordialement,<br>{{company_name}}</p>`;
};

const EMAIL_PRESETS = [
  {
    id: 'simple',
    label: 'Simple',
    desc: 'Message court et direct',
    subjectFn: (type) => type === 'daily'
      ? 'Rapport de présence du {{report_date}}'
      : 'Rapport de présence — {{period_label}}',
    bodyFn: _SIMPLE_BODY,
  },
  {
    id: 'professionnel',
    label: 'Professionnel',
    desc: 'Ton formel avec récapitulatif',
    subjectFn: (type) => type === 'daily'
      ? '[{{company_name}}] Rapport de présence du {{report_date}}'
      : '[{{company_name}}] Rapport de présence — {{period_label}}',
    bodyFn: _PROF_BODY,
  },
  {
    id: 'hebdomadaire',
    label: 'Hebdomadaire',
    desc: 'Adapté aux rapports de semaine',
    subject: 'Rapport hebdomadaire — semaine du {{week_start}} au {{week_end}}',
    body: `<p>Bonjour,</p>

<p>Veuillez trouver ci-joint le rapport de présence hebdomadaire pour la semaine du <strong>{{week_start}}</strong> au <strong>{{week_end}}</strong>.</p>

<p>
  Résumé de la semaine :<br>
  • Employés : <strong>{{total_employees}}</strong><br>
  • Pointages enregistrés : <strong>{{total_records}}</strong>
</p>

<p>Bonne semaine,<br>{{company_name}}</p>`,
  },
  {
    id: 'mensuel',
    label: 'Mensuel',
    desc: 'Bilan mensuel avec statistiques',
    subject: 'Rapport mensuel — {{month_name}} {{year}}',
    body: `<p>Bonjour,</p>

<p>Le rapport de présence du mois de <strong>{{month_name}} {{year}}</strong> est disponible en pièce jointe.</p>

<p>
  Bilan du mois :<br>
  • Employés concernés : <strong>{{total_employees}}</strong><br>
  • Total des enregistrements : <strong>{{total_records}}</strong>
</p>

<p>Cordialement,<br>{{company_name}}</p>`,
  },
];

const TEMPLATE_VARS = [
  '{{company_name}}', '{{period_label}}', '{{total_employees}}',
  '{{total_records}}', '{{generated_at}}', '{{report_date}}',
  '{{week_start}}', '{{week_end}}', '{{month_name}}', '{{year}}',
];

const EMPTY = {
  name: '', is_active: true,
  schedule_type: 'daily', send_hour: 8, send_minute: 0,
  week_day: 0, month_day: 1,
  data_period: 'yesterday',
  language: 'fr',
  group_by: 'employee',
  device_ids: null, company_id: null, department_id: null,
  email_subject: '', email_body: '',
  recipients: [],
};

// ── Component ────────────────────────────────────────────────────────────────

export default function ScheduleModal({ schedule, onClose, onSaved }) {
  const isEdit = !!schedule?.id;
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() =>
    schedule ? { ...EMPTY, ...schedule, recipients: schedule.recipients || [] } : { ...EMPTY }
  );
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const bodyRef = useRef(null);

  const pad = (n) => String(n).padStart(2, '0');

  const setType = (type) => {
    setForm(f => ({
      ...f,
      schedule_type: type,
      data_period: DEFAULT_PERIOD[type] || 'yesterday',
    }));
  };

  const applyPreset = (preset) => {
    setForm(f => ({
      ...f,
      email_subject: preset.subjectFn ? preset.subjectFn(f.schedule_type) : preset.subject,
      email_body:    preset.bodyFn    ? preset.bodyFn(f.schedule_type)    : preset.body,
    }));
  };

  const insertVar = (v) => {
    const ta = bodyRef.current;
    if (!ta) { setForm(f => ({ ...f, email_body: (f.email_body || '') + v })); return; }
    const start = ta.selectionStart;
    const body = form.email_body || '';
    const next = body.slice(0, start) + v + body.slice(ta.selectionEnd);
    setForm(f => ({ ...f, email_body: next }));
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + v.length, start + v.length); });
  };

  const addEmail = () => {
    const e = newEmail.trim().toLowerCase();
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || form.recipients.includes(e)) return;
    setForm(f => ({ ...f, recipients: [...f.recipients, e] }));
    setNewEmail('');
  };

  const save = async () => {
    if (!form.name.trim()) { setError('Le nom du programme est requis'); return; }
    if (form.recipients.length === 0) { setError('Ajoutez au moins un destinataire'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        send_hour:   parseInt(form.send_hour,   10),
        send_minute: parseInt(form.send_minute, 10),
        week_day:    form.schedule_type === 'weekly'      ? parseInt(form.week_day,  10) : null,
        month_day:   form.schedule_type === 'monthly_day' ? parseInt(form.month_day, 10) : null,
      };
      const saved = isEdit
        ? await api.updateReportSchedule(schedule.id, payload)
        : await api.createReportSchedule(payload);
      onSaved(saved);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const STEPS = ['Fréquence', 'Horaire', 'Rapport & Modèle', 'Destinataires'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col transform transition-all animate-scaleIn">

        {/* ── Header ── */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 shrink-0">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              {isEdit ? 'Modifier le programme' : 'Nouveau programme d\'envoi'}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">Rapport PDF automatique par email</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* ── Step tabs ── */}
        <div className="flex border-b border-gray-200 shrink-0 px-6">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = step > n;
            const active = step === n;
            return (
              <button
                key={n}
                onClick={() => n < step && setStep(n)}
                disabled={n > step}
                className={`flex items-center gap-2 py-3 px-2 mr-4 border-b-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  active  ? 'border-primary-500 text-primary-600'
                  : done  ? 'border-transparent text-gray-500 hover:text-gray-700 cursor-pointer'
                          : 'border-transparent text-gray-400 cursor-default'}`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  active ? 'bg-primary-600 text-white'
                  : done ? 'bg-green-500 text-white'
                         : 'bg-gray-200 text-gray-500'}`}>
                  {done ? <Check className="w-3 h-3" /> : n}
                </span>
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ════ Step 1: Frequency ════ */}
          {step === 1 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Nom du programme <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  placeholder="ex. Rapport journalier"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Fréquence d'envoi</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: 'daily',        l: 'Quotidien',          sub: 'Chaque jour à heure fixe' },
                    { v: 'weekly',       l: 'Hebdomadaire',        sub: 'Un jour fixe par semaine' },
                    { v: 'monthly_day',  l: 'Mensuel (jour fixe)', sub: 'Le Nᵉ jour de chaque mois' },
                    { v: 'monthly_last', l: 'Fin de mois',         sub: 'Dernier jour de chaque mois' },
                  ].map(opt => (
                    <button
                      key={opt.v}
                      onClick={() => setType(opt.v)}
                      className={`text-left p-3 rounded-xl border-2 transition-all ${
                        form.schedule_type === opt.v
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                    >
                      <div className="text-sm font-semibold text-gray-900">{opt.l}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{opt.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Active toggle — matches GeneralSettings style */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">Programme actif</p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {form.is_active ? 'Les envois sont activés' : 'Les envois sont suspendus'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <span className="text-sm font-medium text-gray-700">{form.is_active ? 'Activé' : 'Désactivé'}</span>
                    <button
                      onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active ? 'bg-primary-600' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ════ Step 2: Timing ════ */}
          {step === 2 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Heure d'envoi</label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-1.5">
                    <input
                      type="number" min="0" max="23" value={form.send_hour}
                      onChange={e => setForm(f => ({ ...f, send_hour: e.target.value }))}
                      className="w-16 px-2 py-2 bg-white border border-gray-300 rounded-lg text-sm text-center font-mono font-bold focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                    <span className="text-gray-400 font-bold">h</span>
                    <input
                      type="number" min="0" max="59" step="5" value={form.send_minute}
                      onChange={e => setForm(f => ({ ...f, send_minute: e.target.value }))}
                      className="w-16 px-2 py-2 bg-white border border-gray-300 rounded-lg text-sm text-center font-mono font-bold focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                    <span className="text-gray-400 font-bold">min</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    Envoi à <strong className="text-gray-800 font-mono">{pad(form.send_hour)}:{pad(form.send_minute)}</strong>
                  </div>
                </div>
              </div>

              {form.schedule_type === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Jour de la semaine</label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {DAYS_FR.map((d, i) => (
                      <button
                        key={i}
                        onClick={() => setForm(f => ({ ...f, week_day: i }))}
                        className={`py-2.5 text-xs font-medium rounded-lg border-2 transition-all ${
                          parseInt(form.week_day) === i
                            ? 'border-primary-500 bg-primary-50 text-primary-700 font-semibold'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                      >
                        {d.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    Envoi le <strong className="text-gray-700">{DAYS_FR[parseInt(form.week_day)] || '?'}</strong> à{' '}
                    <strong className="text-gray-700 font-mono">{pad(form.send_hour)}:{pad(form.send_minute)}</strong>
                  </p>
                </div>
              )}

              {form.schedule_type === 'monthly_day' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Jour du mois (1 – 28)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number" min="1" max="28" value={form.month_day}
                      onChange={e => setForm(f => ({ ...f, month_day: e.target.value }))}
                      className="w-20 px-3 py-2.5 border border-gray-300 rounded-xl text-sm text-center font-mono font-bold focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                    <span className="text-sm text-gray-500">du mois à {pad(form.send_hour)}:{pad(form.send_minute)}</span>
                  </div>
                </div>
              )}

              {form.schedule_type === 'monthly_last' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    Envoi le <strong>dernier jour</strong> de chaque mois à{' '}
                    <strong className="font-mono">{pad(form.send_hour)}:{pad(form.send_minute)}</strong>
                  </p>
                </div>
              )}
            </>
          )}

          {/* ════ Step 3: Data & Template ════ */}
          {step === 3 && (
            <>
              {/* Period & Language side by side */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Période des données</label>
                  <div className="space-y-2">
                    {(DATA_PERIOD_OPTIONS[form.schedule_type] || []).map(opt => (
                      <label
                        key={opt.v}
                        className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all ${
                          form.data_period === opt.v
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'}`}
                      >
                        <input type="radio" checked={form.data_period === opt.v}
                          onChange={() => setForm(f => ({ ...f, data_period: opt.v }))}
                          className="text-primary-600 accent-primary-600" />
                        <span className="text-sm text-gray-800">{opt.l}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Langue du rapport PDF</label>
                    <div className="flex flex-col gap-1.5">
                      {[{ v: 'fr', l: '🇫🇷  Français' }, { v: 'en', l: '🇬🇧  English' }, { v: 'ar', l: '🇸🇦  العربية' }].map(opt => (
                        <label
                          key={opt.v}
                          className={`flex items-center gap-2.5 px-3 py-2 border-2 rounded-xl cursor-pointer text-sm transition-all ${
                            form.language === opt.v
                              ? 'border-primary-500 bg-primary-50 font-medium'
                              : 'border-gray-200 hover:border-gray-300'}`}
                        >
                          <input type="radio" checked={form.language === opt.v}
                            onChange={() => setForm(f => ({ ...f, language: opt.v }))}
                            className="text-primary-600 accent-primary-600" />
                          {opt.l}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Grouper le rapport par</label>
                    <div className="flex flex-col gap-1.5">
                      {[
                        { v: 'employee',   l: 'Employé' },
                        { v: 'date',       l: 'Date' },
                        { v: 'department', l: 'Département' },
                        { v: 'none',       l: 'Sans groupement' },
                      ].map(opt => (
                        <label
                          key={opt.v}
                          className={`flex items-center gap-2.5 px-3 py-2 border-2 rounded-xl cursor-pointer text-sm transition-all ${
                            form.group_by === opt.v
                              ? 'border-primary-500 bg-primary-50 font-medium'
                              : 'border-gray-200 hover:border-gray-300'}`}
                        >
                          <input type="radio" checked={form.group_by === opt.v}
                            onChange={() => setForm(f => ({ ...f, group_by: opt.v }))}
                            className="text-primary-600 accent-primary-600" />
                          {opt.l}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Email template */}
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Modèles prêts à l'emploi</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {EMAIL_PRESETS.map(p => {
                      const presetSubject = p.subjectFn ? p.subjectFn(form.schedule_type) : p.subject;
                      return (
                      <button
                        key={p.id}
                        onClick={() => applyPreset(p)}
                        className={`text-left px-3 py-2.5 border-2 rounded-xl transition-all text-sm ${
                          form.email_subject === presetSubject
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'}`}
                      >
                        <div className="font-medium text-gray-900">{p.label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{p.desc}</div>
                      </button>
                    );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Objet de l'email</label>
                  <input
                    value={form.email_subject || ''}
                    onChange={e => setForm(f => ({ ...f, email_subject: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    placeholder="Objet de l'email…"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-gray-700">Corps de l'email</label>
                    <div className="flex flex-wrap gap-1">
                      {TEMPLATE_VARS.map(v => (
                        <button
                          key={v}
                          onClick={() => insertVar(v)}
                          title={`Insérer ${v}`}
                          className="px-1.5 py-0.5 text-[10px] font-mono bg-white border border-gray-300 text-gray-600 rounded hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700 transition-colors"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    ref={bodyRef}
                    value={form.email_body || ''}
                    onChange={e => setForm(f => ({ ...f, email_body: e.target.value }))}
                    rows={9}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-y font-mono"
                    placeholder="Corps de l'email (HTML accepté)…"
                    spellCheck={false}
                  />
                </div>
              </div>
            </>
          )}

          {/* ════ Step 4: Recipients ════ */}
          {step === 4 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Destinataires <span className="text-red-500">*</span>
                  {form.recipients.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-full font-semibold">{form.recipients.length}</span>
                  )}
                </label>
                <div className="flex gap-2">
                  <input
                    type="email" value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addEmail()}
                    className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    placeholder="email@exemple.com"
                    autoFocus
                  />
                  <button
                    onClick={addEmail}
                    className="px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 text-sm font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Ajouter
                  </button>
                </div>
              </div>

              {form.recipients.length > 0 ? (
                <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                  {form.recipients.map((email, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                          <span className="text-primary-700 text-xs font-bold">{email[0]?.toUpperCase()}</span>
                        </div>
                        <span className="text-sm text-gray-800">{email}</span>
                      </div>
                      <button
                        onClick={() => setForm(f => ({ ...f, recipients: f.recipients.filter((_, j) => j !== i) }))}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-gray-200 rounded-xl text-gray-400">
                  <Mail className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-sm font-medium">Aucun destinataire</p>
                  <p className="text-xs mt-1 opacity-70">Ajoutez au moins une adresse email</p>
                </div>
              )}

              {/* Summary */}
              {form.name && (
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Récapitulatif</p>
                  <div className="space-y-1.5 text-sm">
                    {[
                      ['Programme',   form.name],
                      ['Fréquence',   { daily: 'Quotidien', weekly: 'Hebdomadaire', monthly_day: 'Mensuel (jour fixe)', monthly_last: 'Fin de mois' }[form.schedule_type]],
                      ['Heure',       `${pad(form.send_hour)}:${pad(form.send_minute)}`],
                      ['Grouper par', { employee: 'Employé', date: 'Date', department: 'Département', none: 'Sans groupement' }[form.group_by] || form.group_by],
                      ['Destinataires', form.recipients.length],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-gray-500">{k}</span>
                        <span className="font-medium text-gray-800">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <X className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex gap-3 p-6 bg-gray-50 rounded-b-2xl border-t border-gray-200 shrink-0">
          <button
            onClick={step === 1 ? onClose : () => setStep(s => s - 1)}
            className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 transition-colors font-medium flex items-center justify-center gap-1.5"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 1 ? 'Annuler' : 'Retour'}
          </button>

          {step < 4 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex-1 px-4 py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-medium flex items-center justify-center gap-1.5"
            >
              Suivant <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 px-4 py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors font-medium flex items-center justify-center gap-2"
            >
              {saving
                ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Check className="w-4 h-4" />}
              {isEdit ? 'Enregistrer' : 'Créer le programme'}
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95) } to { opacity: 1; transform: scale(1) } }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out }
        .animate-scaleIn { animation: scaleIn 0.25s ease-out }
      `}</style>
    </div>
  );
}
