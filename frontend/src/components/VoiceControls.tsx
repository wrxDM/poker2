import { useGameStore } from '../store/gameStore';

interface VoiceControlsProps {
  /** IDs of players currently speaking (for animated ring) */
  speakingUsers: Set<string>;
  /** Error message if mic failed */
  error: string | null;
  /** Click handler for mute toggle (mic on/off — others can't hear you) */
  onToggleMute: () => void;
  /** Click handler for deafen toggle (sound on/off — you can't hear others) */
  onToggleDeafen: () => void;
}

export function VoiceControls({ speakingUsers, error, onToggleMute, onToggleDeafen }: VoiceControlsProps) {
  const { isMuted, isSilenced } = useGameStore();

  return (
    <div className="fixed bottom-20 right-3 sm:right-6 z-50 flex flex-col items-end gap-2 voice-controls">
      {/* Error toast */}
      {error && (
        <div className="bg-red-900/90 text-red-200 text-xs px-3 py-2 rounded-lg border border-red-700 max-w-[180px] sm:max-w-[200px]">
          {error}
        </div>
      )}

      {/* Deafen / Undeafen button — hear/silence incoming audio */}
      <button
        onClick={onToggleDeafen}
        className={`
          relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full
          shadow-xl transition-all duration-200 active:scale-90
          ${isSilenced
            ? 'bg-red-900 hover:bg-red-800 border-2 border-red-500'
            : 'bg-gray-700 hover:bg-gray-600 border-2 border-gray-500'
          }
        `}
        title={isSilenced ? '开启声音' : '静音（屏蔽他人声音）'}
      >
        {isSilenced ? (
          // Speaker-slash icon (muted incoming audio)
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            className="w-5 h-5 text-red-300">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          // Speaker with wave icon
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            className="w-5 h-5 text-gray-300">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )}
      </button>

      {/* Mute / Unmute button — mic on/off */}
      <button
        onClick={onToggleMute}
        className={`
          relative flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full
          shadow-xl transition-all duration-200 active:scale-90
          ${isMuted
            ? 'bg-gray-800 hover:bg-gray-700 border-2 border-gray-500'
            : 'bg-green-700 hover:bg-green-600 border-2 border-green-400'
          }
        `}
        title={isMuted ? '解除闭麦' : '闭麦（他人听不见你）'}
      >
        {/* Speaking pulse ring — only visible when unmuted */}
        {!isMuted && speakingUsers.has('local') && (
          <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-40" />
        )}

        {isMuted ? (
          // Mic-slash icon
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            className="w-6 h-6 text-gray-300">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
            <path d="M15 9.34V4a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        ) : (
          // Microphone icon
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            className="w-6 h-6 text-white">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </button>

      {/* Labels */}
      <div className="flex flex-col items-end gap-0.5">
        <div className={`
          text-xs font-medium px-2 py-0.5 rounded-full
          ${isMuted ? 'bg-gray-800 text-gray-400' : 'bg-green-900/80 text-green-300'}
        `}>
          {isMuted ? '已闭麦' : '语音通话中'}
        </div>
        <div className={`
          text-xs font-medium px-2 py-0.5 rounded-full
          ${isSilenced ? 'bg-red-900/80 text-red-300' : 'bg-gray-800 text-gray-400'}
        `}>
          {isSilenced ? '已静音' : '可听'}
        </div>
      </div>
    </div>
  );
}
