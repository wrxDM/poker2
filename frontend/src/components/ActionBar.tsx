import { useState, useEffect, useRef } from 'react';
import type { HandAction } from '../types';

interface ActionBarProps {
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaise: number;
  maxRaise: number;
  chips: number;
  isMyTurn: boolean;
  onAction: (action: HandAction, amount?: number) => void;
  timerSeconds?: number;
  className?: string;
}

function btnClass(hasTimer: boolean, btnCount: number) {
  const isMany = btnCount >= 4 || hasTimer;
  return [
    'action-btn min-h-[48px] flex-shrink-0',
    isMany ? 'px-2 sm:px-3 text-xs sm:text-sm' : 'px-3 sm:px-5 text-sm sm:text-base',
  ].join(' ');
}

function timerClass(btnCount: number) {
  const isMany = btnCount >= 5;
  return [
    'flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 flex items-center justify-center font-bold',
    isMany ? 'text-xs sm:text-sm' : 'text-sm sm:text-base',
  ].join(' ');
}

function callLabel(canCheck: boolean, callAmount: number) {
  return canCheck ? '过牌' : `跟注 ${callAmount.toLocaleString()}`;
}

export function ActionBar({
  canCheck,
  canCall,
  callAmount,
  canRaise,
  minRaise,
  maxRaise,
  chips,
  isMyTurn,
  onAction,
  timerSeconds,
  className = '',
}: ActionBarProps) {
  const [showRaise, setShowRaise] = useState(false);
  const [raiseValue, setRaiseValue] = useState(minRaise);
  const [_btnCount, setBtnCount] = useState(3);

  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const count = el.querySelectorAll('[data-action-btn]').length;
      setBtnCount(count);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!isMyTurn) {
    return (
      <div className={`w-full bg-black/60 backdrop-blur-md border-t border-white/10 py-2 px-4 sm:py-3 sm:px-6 ${className}`}>
        <span className="text-white/50 text-sm">等待其他玩家操作...</span>
      </div>
    );
  }

  const timerColor = timerSeconds !== undefined
    ? timerSeconds <= 5 ? 'text-red-400' : timerSeconds <= 10 ? 'text-yellow-400' : 'text-green-400'
    : '';

  const hasTimer = timerSeconds !== undefined && timerSeconds > 0;
  const hasCall = canCheck || canCall;
  const hasRaise = canRaise;
  const hasAllin = chips > 0;
  const rawCount = (hasTimer ? 1 : 0) + 1 + (hasCall ? 1 : 0) + (hasRaise ? 1 : 0) + (hasAllin ? 1 : 0);
  const count = Math.max(rawCount, 3);

  if (showRaise) {
    return (
      <div className={`w-full bg-black/60 backdrop-blur-md border-t border-white/10 py-2 px-4 sm:py-3 sm:px-6 ${className}`}>
        <div className="max-w-md mx-auto flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-white text-sm font-medium">加注金额</span>
            <span className="text-yellow-400 font-bold text-base sm:text-lg">
              {raiseValue.toLocaleString()} 筹码
            </span>
          </div>
          <input
            type="range"
            min={minRaise}
            step={10}
            max={Math.min(chips, maxRaise)}
            value={raiseValue}
            onChange={(e) => setRaiseValue(Number(e.target.value))}
            className="w-full accent-yellow-400 h-10"
          />
          <div className="grid grid-cols-4 gap-2">
            {[minRaise, Math.floor((minRaise + maxRaise) / 4), Math.floor((minRaise + maxRaise) / 2), maxRaise].map((val) => (
              <button
                key={val}
                onClick={() => setRaiseValue(Math.min(val, chips))}
                className="bg-white/10 hover:bg-white/20 text-white text-xs py-2.5 rounded-lg transition-colors min-h-[44px]"
              >
                {val >= 1000 ? `${Math.floor(val / 1000)}K` : val}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowRaise(false)}
              className="flex-1 action-btn action-btn-fold min-h-[48px]"
            >
              取消
            </button>
            <button
              onClick={() => {
                onAction('raise', raiseValue);
                setShowRaise(false);
              }}
              className="flex-1 action-btn action-btn-raise min-h-[48px]"
            >
              确认加注 {raiseValue.toLocaleString()}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full bg-black/60 backdrop-blur-md border-t border-white/10 py-2 px-4 sm:py-3 sm:px-6 ${className}`}>
      <div
        ref={wrapRef}
        className="max-w-lg mx-auto flex gap-1 sm:gap-2 flex-nowrap justify-center items-center overflow-x-auto"
      >
        {/* Timer */}
        {hasTimer && (
          <div
            className={`${timerClass(count)} ${timerColor}`}
            style={{ borderColor: 'currentColor' }}
          >
            {timerSeconds}
          </div>
        )}

        {/* Fold */}
        <button
          data-action-btn
          onClick={() => onAction('fold')}
          className={`${btnClass(hasTimer, count)} action-btn-fold`}
        >
          弃牌
        </button>

        {/* Check / Call */}
        {hasCall && (
          <button
            data-action-btn
            onClick={() => onAction(canCheck ? 'check' : 'call')}
            className={`${btnClass(hasTimer, count)} action-btn-check`}
          >
            {callLabel(canCheck, callAmount)}
          </button>
        )}

        {/* Raise */}
        {hasRaise && (
          <button
            data-action-btn
            onClick={() => {
              setRaiseValue(minRaise);
              setShowRaise(true);
            }}
            className={`${btnClass(hasTimer, count)} action-btn-raise`}
          >
            加注
          </button>
        )}

        {/* All-in */}
        {hasAllin && (
          <button
            data-action-btn
            onClick={() => onAction('allin')}
            className={`${btnClass(hasTimer, count)} action-btn-allin`}
          >
            全下
          </button>
        )}
      </div>
    </div>
  );
}
