import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Compact terminal-style sync indicator (like Claude Code's submit spinner).
 *
 * Renders a small bottom-right card with rolling log lines:
 *   ✓ Connecté à POINTEUSE 201
 *   ✓ 152 enregistrements récupérés
 *   ⠋ Sauvegarde dans la base de données…
 *
 * Props:
 *   visible    – boolean
 *   phase      – 'saving' | 'syncing' | 'done' | 'error'
 *   message    – optional override text for the active phase
 *   deviceName – device label shown in the header
 *   direction  – 'toDevice' | 'fromDevice'
 *
 * The parent passes simple phase changes; we synthesize the log progression
 * from them so the visual feels live without needing backend streaming.
 */
export default function SyncOverlay({
  visible,
  phase = 'syncing',
  message,
  deviceName,
  direction = 'toDevice',
}) {
  const { t } = useTranslation();
  const [lines, setLines] = useState([]);
  const lastPhaseRef = useRef(null);

  // ── Phase → log line text ───────────────────────────────────────────────
  const phaseLabel = (p) => {
    if (direction === 'fromDevice') {
      if (p === 'saving')   return t('syncStepConnecting')  || 'Connexion à l\'appareil…';
      if (p === 'syncing')  return t('syncStepFetching')    || 'Récupération des données…';
      if (p === 'done')     return t('syncStepDone')        || 'Synchronisation terminée';
      if (p === 'error')    return t('syncStepError')       || 'Échec de la synchronisation';
    } else {
      if (p === 'saving')   return t('syncStepSaving')      || 'Enregistrement côté serveur…';
      if (p === 'syncing')  return t('syncStepPushing')     || 'Envoi vers l\'appareil…';
      if (p === 'done')     return t('syncStepDone')        || 'Synchronisation terminée';
      if (p === 'error')    return t('syncStepError')       || 'Échec de la synchronisation';
    }
    return 'Working…';
  };

  // Append a log line when phase changes
  useEffect(() => {
    if (!visible) {
      setLines([]);
      lastPhaseRef.current = null;
      return;
    }
    if (phase === lastPhaseRef.current) return;

    setLines((prev) => {
      // Mark any in-progress line as done (or error) before adding the next
      const finishedPrev = prev.map((l) =>
        l.state === 'active'
          ? { ...l, state: phase === 'error' ? 'error' : 'done' }
          : l
      );
      // Don't add a new line for the terminal phases — they only "finish" the previous one
      if (phase === 'done' || phase === 'error') {
        return finishedPrev;
      }
      return [...finishedPrev, { text: message || phaseLabel(phase), state: 'active' }];
    });

    lastPhaseRef.current = phase;
  }, [visible, phase, message]);

  // Auto-dismiss happens in the parent (setSyncOverlay({ visible:false, ... }))
  // — we just render whatever it gives us.

  if (!visible) return null;

  const isDone  = phase === 'done';
  const isError = phase === 'error';
  const headerTone =
    isError ? 'text-red-700'
    : isDone ? 'text-emerald-700'
    : 'text-slate-700';

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[340px] sm:w-[380px]
                    bg-white rounded-xl shadow-2xl border border-slate-200/80
                    animate-[slideUp_0.2s_ease-out]">

      {/* Header */}
      <div className="px-4 py-2.5 border-b border-slate-200/80 flex items-center gap-2">
        {isDone ? (
          <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
        ) : isError ? (
          <XIcon className="w-4 h-4 text-red-600 shrink-0" />
        ) : (
          <BrailleSpinner className="text-slate-600 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-semibold ${headerTone}`}>
            {direction === 'fromDevice'
              ? (t('syncFromDeviceTitle') || 'Synchronisation depuis l\'appareil')
              : (t('syncToDeviceTitle')   || 'Synchronisation vers l\'appareil')}
          </div>
          {deviceName && (
            <div className="text-[11px] text-slate-500 font-mono truncate">{deviceName}</div>
          )}
        </div>
      </div>

      {/* Log lines */}
      <div className="px-4 py-3 space-y-1 max-h-48 overflow-y-auto font-mono text-[12px]">
        {lines.map((l, i) => (
          <div key={i} className="flex items-start gap-2 leading-relaxed">
            {l.state === 'active' ? (
              <BrailleSpinner className="text-slate-500 mt-[3px]" />
            ) : l.state === 'error' ? (
              <XIcon className="w-3.5 h-3.5 text-red-500 mt-[2px] shrink-0" />
            ) : (
              <CheckIcon className="w-3.5 h-3.5 text-emerald-500 mt-[2px] shrink-0" />
            )}
            <span className={
              l.state === 'active' ? 'text-slate-800'
              : l.state === 'error' ? 'text-red-600'
              : 'text-slate-500'
            }>
              {l.text}
            </span>
          </div>
        ))}
        {(isDone || isError) && (
          <div className="flex items-start gap-2 leading-relaxed pt-1">
            {isDone
              ? <CheckIcon className="w-3.5 h-3.5 text-emerald-600 mt-[2px] shrink-0" />
              : <XIcon    className="w-3.5 h-3.5 text-red-600    mt-[2px] shrink-0" />}
            <span className={isError ? 'text-red-700 font-medium' : 'text-emerald-700 font-medium'}>
              {message || phaseLabel(phase)}
            </span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes braille {
          0%   { content: '\\28CB'; }   10%  { content: '\\2819'; }
          20%  { content: '\\2839'; }   30%  { content: '\\2838'; }
          40%  { content: '\\283C'; }   50%  { content: '\\2834'; }
          60%  { content: '\\2826'; }   70%  { content: '\\2827'; }
          80%  { content: '\\2807'; }   90%  { content: '\\280F'; }
          100% { content: '\\28CB'; }
        }
      `}</style>
    </div>
  );
}

// ── Tiny terminal-style spinner using SVG (no font dependency) ─────────────
function BrailleSpinner({ className = '' }) {
  // 10-frame Braille spinner. Each frame is one character; we rotate via state.
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % frames.length), 80);
    return () => clearInterval(t);
  }, []);
  return (
    <span
      aria-hidden
      className={`inline-block w-3.5 text-center font-mono text-[14px] leading-none ${className}`}
    >
      {frames[i]}
    </span>
  );
}

function CheckIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
         className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
         className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
