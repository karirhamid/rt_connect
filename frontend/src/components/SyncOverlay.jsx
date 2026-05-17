import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Centered single-line sync indicator (Claude-Code-style spinner).
 *
 * Renders a small pill in the middle of the screen:
 *   ⠋ Récupération des données…
 *
 * Each phase change REPLACES the line (no accumulating log).
 *
 * Props:
 *   visible    – boolean
 *   phase      – 'saving' | 'syncing' | 'done' | 'error'
 *   message    – optional override text for the active phase
 *   deviceName – device label shown under the spinner line
 *   direction  – 'toDevice' | 'fromDevice'
 */
export default function SyncOverlay({
  visible,
  phase = 'syncing',
  message,
  deviceName,
  direction = 'toDevice',
}) {
  const { t } = useTranslation();
  const [displayText, setDisplayText] = useState('');
  const [fading, setFading] = useState(false);

  const phaseLabel = (p) => {
    if (direction === 'fromDevice') {
      if (p === 'saving')  return t('syncStepConnecting') || 'Connexion à l\'appareil…';
      if (p === 'syncing') return t('syncStepFetching')   || 'Récupération des données…';
      if (p === 'done')    return t('syncStepDone')       || 'Synchronisation terminée';
      if (p === 'error')   return t('syncStepError')      || 'Échec de la synchronisation';
    } else {
      if (p === 'saving')  return t('syncStepSaving')     || 'Enregistrement côté serveur…';
      if (p === 'syncing') return t('syncStepPushing')    || 'Envoi vers l\'appareil…';
      if (p === 'done')    return t('syncStepDone')       || 'Synchronisation terminée';
      if (p === 'error')   return t('syncStepError')      || 'Échec de la synchronisation';
    }
    return '';
  };

  // When the phase changes, fade out the current text and swap to the new one
  useEffect(() => {
    if (!visible) return;
    const newText = message || phaseLabel(phase);
    if (newText === displayText) return;
    if (!displayText) {
      setDisplayText(newText);
      return;
    }
    setFading(true);
    const t = setTimeout(() => {
      setDisplayText(newText);
      setFading(false);
    }, 140);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, phase, message]);

  if (!visible) return null;

  const isDone  = phase === 'done';
  const isError = phase === 'error';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center
                 pointer-events-none animate-[fadeIn_0.15s_ease-out]"
    >
      <div
        className="pointer-events-auto bg-white rounded-2xl shadow-2xl border border-slate-200/60
                   px-7 py-6 min-w-[320px] max-w-[480px]
                   animate-[popIn_0.18s_ease-out] flex flex-col items-center gap-3"
      >
        {/* Status icon */}
        <div className="h-9 flex items-center justify-center">
          {isDone ? (
            <CheckIcon className="w-8 h-8 text-emerald-500 animate-[popIn_0.25s_ease-out]" />
          ) : isError ? (
            <XIcon className="w-8 h-8 text-red-500" />
          ) : (
            <BrailleSpinner className="text-slate-700 text-2xl" />
          )}
        </div>

        {/* Text line — fades between phase changes */}
        <div
          className={`text-[15px] font-medium text-center transition-opacity duration-150 ${
            isError ? 'text-red-700' : isDone ? 'text-emerald-700' : 'text-slate-800'
          } ${fading ? 'opacity-0' : 'opacity-100'}`}
        >
          {displayText || phaseLabel(phase)}
        </div>

        {/* Device name (small, under) */}
        {deviceName && (
          <div className="text-[11px] font-mono text-slate-400 -mt-1">
            {deviceName}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn {
          0%   { opacity: 0; transform: scale(0.92); }
          70%  { transform: scale(1.02); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

// ── Spinner + tiny icons ───────────────────────────────────────────────────
function BrailleSpinner({ className = '' }) {
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % frames.length), 80);
    return () => clearInterval(t);
  }, []);
  return (
    <span aria-hidden className={`inline-block w-6 text-center font-mono leading-none ${className}`}>
      {frames[i]}
    </span>
  );
}

function CheckIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
         className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
         className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
