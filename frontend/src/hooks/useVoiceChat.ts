/**
 * useVoiceChat — React hook for WebRTC voice chat.
 *
 * Manages the VoiceChatManager lifecycle and syncs mute state with the game store.
 * Exposes speaking state for all participants so UI can render indicators.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { VoiceChatManager } from '../services/VoiceChatManager';
import { socketService } from '../services/socket';
import { useGameStore } from '../store/gameStore';
import { logger } from '../utils/logger';


export interface UseVoiceChatReturn {
  /** Whether the local user is muted (others can't hear them) */
  isMuted: boolean;
  /** Toggle mute state (mic on/off) */
  toggleMute: () => void;
  /** Set mute state directly */
  setMuted: (muted: boolean) => void;
  /** Whether the local user has silenced incoming audio (can't hear others) */
  isSilenced: boolean;
  /** Toggle deafen/silence state */
  toggleDeafen: () => void;
  /** Set deafen state directly */
  setSilenced: (silenced: boolean) => void;
  /** IDs of players currently speaking */
  speakingUsers: Set<string>;
  /** Error message if voice init failed */
  error: string | null;
  /** True once the manager has been started */
  isReady: boolean;
  /** Reset all peer connections and re-initiate calls */
  resetVoice: () => Promise<void>;
}

export function useVoiceChat(
  currentUserId: string,
): UseVoiceChatReturn {
  const { isMuted, setMuted: setStoreMuted, isSilenced, setSilenced: setStoreSilenced } = useGameStore();
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const managerRef = useRef<VoiceChatManager | null>(null);

  // ── Initialise / teardown manager ───────────────────────

  useEffect(() => {
    logger.info('useVoiceChat', `mounted, userId=${currentUserId}`);
    const manager = new VoiceChatManager(currentUserId, {
      onSpeakingUser: (userId, speaking) => {
        if (speaking) {
          logger.info('useVoiceChat', `speaking: ${userId}`);
        }
        setSpeakingUsers((prev) => {
          const next = new Set(prev);
          if (speaking) next.add(userId);
          else next.delete(userId);
          return next;
        });
      },
      onError: (err) => {
        logger.error('useVoiceChat', `manager error: ${err.message}`);
        setError(err.message);
      },
    });

    managerRef.current = manager;
    manager.start().then(() => {
      setIsReady(true);
      logger.info('useVoiceChat', 'manager started');
    }).catch((err) => {
      logger.error('useVoiceChat', `manager.start() failed: ${err.message}`);
    });

    return () => {
      logger.info('useVoiceChat', 'unmounting');
      setIsReady(false);
      manager.stop();
      managerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // ── Sync muted state with store ────────────────────────

  useEffect(() => {
    if (managerRef.current) {
      managerRef.current.muted = isMuted;
      logger.info('useVoiceChat', `sync muted → ${isMuted} (manager updated, emitting)`);
    }
    socketService.emitMuteChanged(isMuted);
  }, [isMuted]);

  // ── Sync silenced/deafen state with store ─────────────

  useEffect(() => {
    if (managerRef.current) {
      managerRef.current.silenced = isSilenced;
      logger.info('useVoiceChat', `sync silenced → ${isSilenced} (manager updated)`);
    }
  }, [isSilenced]);

  // ── Listen for incoming signaling events ──────────────

  useEffect(() => {
    const offOffer = socketService.on('voice:offer', (data: unknown) => {
      const { fromUserId, offer } = data as { fromUserId: string; offer: RTCSessionDescriptionInit };
      logger.info('useVoiceChat', `voice:offer from ${fromUserId}`);
      managerRef.current?.handleOffer(fromUserId, offer).then((answer) => {
        socketService.emitVoiceAnswer(fromUserId, answer);
      });
    });

    const offAnswer = socketService.on('voice:answer', (data: unknown) => {
      const { fromUserId, answer } = data as { fromUserId: string; answer: RTCSessionDescriptionInit };
      logger.info('useVoiceChat', `voice:answer from ${fromUserId}`);
      managerRef.current?.handleAnswer(fromUserId, answer);
    });

    const offIce = socketService.on('voice:ice_candidate', (data: unknown) => {
      const { fromUserId, candidate } = data as { fromUserId: string; candidate: RTCIceCandidateInit };
      managerRef.current?.handleIceCandidate(fromUserId, candidate);
    });

    const offMuteChanged = socketService.on('voice:mute_changed', (data: unknown) => {
      const { userId, muted } = data as { userId: string; muted: boolean };
      logger.info('useVoiceChat', `voice:mute_changed — ${userId} muted=${muted}`);
      // Store mute state of remote users in the player list — consumed by PlayerSeat
      useGameStore.setState((state) => {
        if (!state.currentRoom) return {};
        return {
          currentRoom: {
            ...state.currentRoom,
            players: state.currentRoom.players.map((p) =>
              p.userId === userId ? { ...p, muted: muted ?? false } : p,
            ),
          },
        };
      });
    });

    return () => {
      offOffer();
      offAnswer();
      offIce();
      offMuteChanged();
    };
  }, []);

  // ── Remove peers when players leave ─────────────────

  useEffect(() => {
    const offLeft = socketService.on('room:player_left', (data: unknown) => {
      const { userId } = data as { userId: string };
      logger.info('useVoiceChat', `room:player_left — ${userId}`);
      managerRef.current?.removePeer(userId);
    });
    return () => offLeft();
  }, []);

  // ── Actions ─────────────────────────────────────────

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    logger.info('useVoiceChat', `toggleMute: ${isMuted} → ${next}`);
    setStoreMuted(next);
  }, [isMuted, setStoreMuted]);

  const toggleDeafen = useCallback(() => {
    const next = !isSilenced;
    logger.info('useVoiceChat', `toggleDeafen: ${isSilenced} → ${next}`);
    setStoreSilenced(next);
  }, [isSilenced, setStoreSilenced]);

  const resetVoice = useCallback(async () => {
    logger.info('useVoiceChat', 'resetVoice');
    await managerRef.current?.resetVoice();
  }, []);

  return {
    isMuted,
    toggleMute,
    setMuted: setStoreMuted,
    isSilenced,
    toggleDeafen,
    setSilenced: setStoreSilenced,
    speakingUsers,
    error,
    isReady,
    resetVoice,
  };
}
