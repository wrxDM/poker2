interface PotDisplayProps {
  pot: number;
  sidePots?: number[];
}

export function PotDisplay({ pot, sidePots = [] }: PotDisplayProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 sm:px-4 sm:py-2 rounded-2xl border border-yellow-600/50 backdrop-blur-sm">
        <span className="text-yellow-400 font-bold text-base sm:text-xl">
          🏆 底池
        </span>
        <span className="text-white font-bold text-lg sm:text-2xl tabular-nums">
          {pot.toLocaleString()}
        </span>
      </div>
      {sidePots.length > 0 && (
        <div className="flex gap-1 sm:gap-2">
          {sidePots.map((sp, i) => (
            <div key={i} className="bg-purple-900/50 px-2 py-0.5 sm:px-3 sm:py-1 rounded-xl border border-purple-500/50">
              <span className="text-purple-300 text-[10px] sm:text-xs">边池 {i + 1}</span>
              <span className="text-white font-bold text-xs sm:text-sm ml-1">{sp.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
