import { useTranslation } from 'react-i18next';

/**
 * Professional sync-in-progress overlay.
 * Shows: Server icon ──► animated data packets ──► Device icon
 *
 * Props:
 *   visible    – boolean
 *   message    – optional text below animation (defaults to i18n key)
 *   phase      – 'saving' | 'syncing' | 'done' | 'error'
 *   deviceName – name of the device (e.g. "POINTEUSE RDC")
 *   direction  – 'toDevice' (server→device) | 'fromDevice' (device→server)
 */
export default function SyncOverlay({ visible, message, phase = 'syncing', deviceName, direction = 'toDevice' }) {
  const { t } = useTranslation();
  if (!visible) return null;

  const dirLabel = direction === 'fromDevice'
    ? (phase === 'saving'
        ? t('syncOverlayFetching') || 'Fetching from device…'
        : phase === 'done'
          ? t('syncOverlayDone') || 'Sync complete'
          : phase === 'error'
            ? t('syncOverlayError') || 'Sync failed'
            : t('syncOverlayReceiving') || 'Receiving data…')
    : (phase === 'saving'
        ? t('syncOverlaySaving') || 'Saving to server…'
        : phase === 'done'
          ? t('syncOverlayDone') || 'Sync complete'
          : phase === 'error'
            ? t('syncOverlayError') || 'Sync failed'
            : t('syncOverlaySyncing') || 'Syncing to device…');

  const label = message || dirLabel;
  const isDone = phase === 'done';
  const isError = phase === 'error';
  const isFromDevice = direction === 'fromDevice';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-white rounded-2xl shadow-2xl w-[420px] overflow-hidden animate-[scaleIn_0.3s_ease-out]">
        {/* Top accent bar */}
        <div className={`h-1.5 ${isError ? 'bg-red-500' : isDone ? 'bg-green-500' : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-500 bg-[length:200%_100%] animate-[shimmer_1.8s_linear_infinite]'}`} />

        {/* Animation area */}
        <div className="px-8 pt-8 pb-4">
          <div className="flex items-center justify-center gap-2">
            {/* ── Left icon (Server or Device depending on direction) ── */}
            <div className={`flex flex-col items-center transition-all duration-500 ${
              (!isFromDevice && phase === 'saving') || (isFromDevice && phase === 'syncing') ? 'scale-110' : ''
            }`}>
              <div className={`w-16 h-16 rounded-xl flex items-center justify-center shadow-lg transition-colors duration-300 ${
                isDone ? 'bg-green-100 ring-2 ring-green-400'
                  : isError ? 'bg-red-100 ring-2 ring-red-400'
                  : isFromDevice && phase === 'syncing' ? 'bg-indigo-100 ring-2 ring-indigo-400 animate-pulse'
                  : !isFromDevice ? 'bg-blue-100 ring-2 ring-blue-400'
                  : 'bg-gray-100 ring-2 ring-gray-300'
              }`}>
                {isFromDevice ? (
                  /* Biometric device SVG */
                  <svg className={`w-8 h-8 transition-colors ${isDone ? 'text-green-600' : isError ? 'text-red-600' : phase === 'syncing' ? 'text-indigo-600' : 'text-gray-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="2" width="16" height="20" rx="3" />
                    <circle cx="12" cy="10" r="3" />
                    <path d="M8 18h8" />
                    <circle cx="12" cy="10" r="1" fill="currentColor" />
                  </svg>
                ) : (
                  /* Server / database SVG */
                  <svg className={`w-8 h-8 transition-colors ${isDone ? 'text-green-600' : isError ? 'text-red-600' : 'text-blue-600'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="6" rx="2" />
                    <rect x="2" y="10" width="20" height="6" rx="2" />
                    <line x1="6" y1="5" x2="6.01" y2="5" strokeWidth="2" />
                    <line x1="6" y1="13" x2="6.01" y2="13" strokeWidth="2" />
                    <path d="M6 18v2M18 18v2M10 20h4" />
                  </svg>
                )}
              </div>
              <span className="mt-2 text-xs font-semibold text-gray-500 uppercase tracking-wider max-w-[90px] text-center truncate">
                {isFromDevice ? (deviceName ? `Pointeuse` : 'Pointeuse') : 'Server'}
              </span>
              {isFromDevice && deviceName && (
                <span className="text-[10px] text-gray-400 font-medium max-w-[100px] text-center truncate">{deviceName}</span>
              )}
            </div>

            {/* ── Connection line with animated packets ── */}
            <div className="flex-1 mx-1 relative h-12 flex items-center">
              {/* Base line */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] bg-gray-200 rounded-full" />

              {isDone ? (
                /* Completed check */
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-500 animate-[popIn_0.4s_ease-out]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              ) : isError ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </div>
              ) : (
                /* Animated data packets flowing left → right */
                <>
                  <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-500 shadow-md shadow-blue-300 animate-[packet_1.4s_ease-in-out_infinite]" />
                  <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-indigo-400 shadow-md shadow-indigo-200 animate-[packet_1.4s_ease-in-out_0.5s_infinite]" />
                  <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-400 shadow-sm shadow-blue-200 animate-[packet_1.4s_ease-in-out_1s_infinite]" />
                  {/* Arrow head */}
                  <svg className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M6 3l5 5-5 5V3z" />
                  </svg>
                </>
              )}
            </div>

            {/* ── Right icon (Device or Server depending on direction) ── */}
            <div className={`flex flex-col items-center transition-all duration-500 ${
              (!isFromDevice && phase === 'syncing') || (isFromDevice && phase === 'saving') ? 'scale-110' : ''
            }`}>
              <div className={`w-16 h-16 rounded-xl flex items-center justify-center shadow-lg transition-colors duration-300 ${
                isDone ? 'bg-green-100 ring-2 ring-green-400'
                  : isError ? 'bg-red-100 ring-2 ring-red-400'
                  : !isFromDevice && phase === 'syncing' ? 'bg-indigo-100 ring-2 ring-indigo-400 animate-pulse'
                  : isFromDevice ? 'bg-blue-100 ring-2 ring-blue-400'
                  : 'bg-gray-100 ring-2 ring-gray-300'
              }`}>
                {isFromDevice ? (
                  /* Server / database SVG */
                  <svg className={`w-8 h-8 transition-colors ${isDone ? 'text-green-600' : isError ? 'text-red-600' : 'text-blue-600'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="6" rx="2" />
                    <rect x="2" y="10" width="20" height="6" rx="2" />
                    <line x1="6" y1="5" x2="6.01" y2="5" strokeWidth="2" />
                    <line x1="6" y1="13" x2="6.01" y2="13" strokeWidth="2" />
                    <path d="M6 18v2M18 18v2M10 20h4" />
                  </svg>
                ) : (
                  /* Biometric device SVG */
                  <svg className={`w-8 h-8 transition-colors ${isDone ? 'text-green-600' : isError ? 'text-red-600' : phase === 'syncing' ? 'text-indigo-600' : 'text-gray-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="2" width="16" height="20" rx="3" />
                    <circle cx="12" cy="10" r="3" />
                    <path d="M8 18h8" />
                    <circle cx="12" cy="10" r="1" fill="currentColor" />
                  </svg>
                )}
              </div>
              <span className="mt-2 text-xs font-semibold text-gray-500 uppercase tracking-wider max-w-[90px] text-center truncate">
                {isFromDevice ? 'Server' : (deviceName ? 'Pointeuse' : 'Pointeuse')}
              </span>
              {!isFromDevice && deviceName && (
                <span className="text-[10px] text-gray-400 font-medium max-w-[100px] text-center truncate">{deviceName}</span>
              )}
            </div>
          </div>
        </div>

        {/* Status text + progress bar */}
        <div className="px-8 pb-6 text-center">
          <p className={`text-sm font-medium mt-2 ${isError ? 'text-red-600' : isDone ? 'text-green-600' : 'text-gray-700'}`}>
            {label}
          </p>
          {!isDone && !isError && (
            <div className="mt-3 h-1 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full animate-[progress_2s_ease-in-out_infinite]" />
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.92) } to { opacity: 1; transform: scale(1) } }
        @keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
        @keyframes packet {
          0%   { left: 4%; opacity: 0; transform: translateY(-50%) scale(0.5) }
          15%  { opacity: 1; transform: translateY(-50%) scale(1) }
          85%  { opacity: 1; transform: translateY(-50%) scale(1) }
          100% { left: 88%; opacity: 0; transform: translateY(-50%) scale(0.5) }
        }
        @keyframes progress {
          0%   { width: 5% }
          50%  { width: 70% }
          100% { width: 5% }
        }
        @keyframes popIn {
          0%   { transform: scale(0); opacity: 0 }
          60%  { transform: scale(1.2) }
          100% { transform: scale(1); opacity: 1 }
        }
      `}</style>
    </div>
  );
}
