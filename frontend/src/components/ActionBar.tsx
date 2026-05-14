import { useState } from 'react';
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
}: ActionBarProps) {
  const [showRaise, setShowRaise] = useState(false);
  const [raiseValue, setRaiseValue] = useState(minRaise);

  if (!isMyTurn) {
    return (
      <div className="w-full bg-black/60 backdrop-blur-md border-t border-white/10 py-4 px-6 flex items-center justify-center">
        <span className="text-white/50 text-sm">等待其他玩家操作...</span>
      </div>
    );
  }

  if (showRaise) {
    return (
      <div className="w-full bg-black/60 backdrop-blur-md border-t border-white/10 py-4 px-6">
        <div className="max-w-md mx-auto flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-white text-sm font-medium">加注金额</span>
            <span className="text-yellow-400 font-bold text-lg">
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
            className="w-full accent-yellow-400"
          />
          <div className="flex gap-2">
            {[minRaise, Math.floor((minRaise + maxRaise) / 4), Math.floor((minRaise + maxRaise) / 2), maxRaise].map((val) => (
              <button
                key={val}
                onClick={() => setRaiseValue(Math.min(val, chips))}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white text-xs py-1.5 rounded-lg transition-colors"
              >
                {val >= 1000 ? `${Math.floor(val / 1000)}K` : val}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowRaise(false)}
              className="flex-1 action-btn action-btn-fold"
            >
              取消
            </button>
            <button
              onClick={() => {
                onAction('raise', raiseValue);
                setShowRaise(false);
              }}
              className="flex-1 action-btn action-btn-raise"
            >
              确认加注 {raiseValue.toLocaleString()}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-black/60 backdrop-blur-md border-t border-white/10 py-4 px-6">
      <div className="max-w-lg mx-auto flex gap-3 flex-wrap justify-center">
        {/* Fold */}
        <button
          onClick={() => onAction('fold')}
          className="action-btn action-btn-fold"
        >
          弃牌
        </button>

        {/* Check / Call */}
        {canCheck ? (
          <button
            onClick={() => onAction('check')}
            className="action-btn action-btn-check"
          >
            过牌
          </button>
        ) : canCall ? (
          <button
            onClick={() => onAction('call')}
            className="action-btn action-btn-call"
          >
            跟注 {callAmount.toLocaleString()}
          </button>
        ) : null}

        {/* Raise (only when can check/call is available, or when no bet yet) */}
        {canRaise ? (
          <button
          onClick={() => {
            setRaiseValue(minRaise);
            setShowRaise(true);
          }}
          className="action-btn action-btn-raise"
        >
          加注
        </button>
        ) : null}

        {/* All-in */}
        {chips > 0 && (
          <button
            onClick={() => onAction('allin')}
            className="action-btn action-btn-allin"
          >
            全下 💰 {chips.toLocaleString()}
          </button>
        )}
      </div>
    </div>
  );
}
