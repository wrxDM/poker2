import type { PlayerInRoom, Card, EvaluatedHand } from '../types/index.js';
import { evaluateHand, compareHands } from './HandEvaluator.js';

/** 底池分配结果 */
export interface PotDistribution {
  /** 每个底池的分配详情 */
  pots: {
    /** 底池金额 */
    amount: number;
    /** 该底池的获胜者（多个表示平局） */
    winners: string[];
    /** 每位获胜者分得的金额 */
    winAmounts: { playerId: string; amount: number }[];
  }[];
  /** 总共分配的筹码 */
  totalDistributed: number;
}

/** 玩家评估手牌结果 */
interface EvaluatedPlayer {
  playerId: string;
  hand: Card[];
  evaluated: EvaluatedHand;
}

export class BetManager {
  private pot: number = 0;
  private sidePots: number[] = [];
  private playerBets: Map<string, number> = new Map();
  private currentBet: number = 0;
  private lastRaise: number = 0;

  /** 清空所有状态（含底池），用于整局重置 */
  resetAll(): void {
    this.pot = 0;
    this.sidePots = [];
    this.playerBets.clear();
    this.currentBet = 0;
    this.lastRaise = 0;
  }

  /** 只清本轮下注状态，不清底池，用于进入下一轮 */
  resetRound(): void {
    this.currentBet = 0;
    this.lastRaise = 0;
  }

  getPot(): number {
    return this.pot;
  }

  getCurrentBet(): number {
    return this.currentBet;
  }

  getLastRaise(): number {
    return this.lastRaise;
  }

  getMinRaise(): number {
    return this.lastRaise > 0 ? this.currentBet + this.lastRaise : this.currentBet * 2;
  }

  setCurrentBet(amount: number): void {
    this.currentBet = amount;
  }

  setLastRaise(amount: number): void {
    this.lastRaise = amount;
  }

  addBet(playerId: string, amount: number): void {
    const current = this.playerBets.get(playerId) || 0;
    this.playerBets.set(playerId, current + amount);
    this.pot += amount;
  }

  getPlayerBet(playerId: string): number {
    return this.playerBets.get(playerId) || 0;
  }

  getPlayerContribution(playerId: string, totalChips: number): number {
    const bet = this.playerBets.get(playerId) || 0;
    return Math.min(bet, totalChips);
  }

  collectBets(): void {
    this.pot += [...this.playerBets.values()].reduce((a, b) => a + b, 0);
    this.playerBets.clear();
    this.currentBet = 0;
    this.lastRaise = 0;
  }

  distributePots(winners: { playerId: string; amount: number }[]): void {
  }

  getAllInPlayers(players: PlayerInRoom[]): PlayerInRoom[] {
    return players.filter(p => p.allin && !p.folded);
  }

  /**
   * 计算底池分配
   * 
   * 算法步骤：
   * 1. 找出所有未弃牌玩家
   * 2. 评估手牌并按牌力降序排序
   * 3. 按牌力分组，依次处理每组相同牌力的玩家：
   *    a. 计算本轮最小投入
   *    b. 计算仍在争夺的玩家数量（有剩余投入的玩家）
   *    c. 本轮底池 = 最小投入 × 仍在争夺的玩家数
   *    d. 该组胜者平分底池
   *    e. 从胜者剩余投入中扣除最小投入
   * 4. 循环直到所有投入分配完毕
   * 
   * @param players - 所有玩家
   * @param communityCards - 公共牌
   * @returns 底池分配结果
   */
  calculatePotDistribution(players: PlayerInRoom[], communityCards: Card[]): PotDistribution {
    console.log('[PotDistribution] ====== START ======');
    console.log('[PotDistribution] Players:', players.map(p => ({ id: p.userId, chips: p.chips, hand: p.hand, folded: p.folded })));
    console.log('[PotDistribution] Community cards:', communityCards);
    console.log('[PotDistribution] playerBets:', Object.fromEntries(this.playerBets));

    // Step 1: Filter non-folded players and sort by hand strength descending
    const activePlayers = players.filter(p => !p.folded);
    console.log('[PotDistribution] Active players (not folded):', activePlayers.map(p => p.userId));
    if (activePlayers.length === 0) {
      console.log('[PotDistribution] No active players, returning empty distribution');
      return { pots: [], totalDistributed: 0 };
    }

    // Evaluate hand strength for each player
    const evaluatedPlayers: EvaluatedPlayer[] = activePlayers.map(p => {
      const hand = evaluateHand(p.hand ?? [], communityCards);
      console.log(`[PotDistribution] Evaluated ${p.userId}: hand=${hand.description}, rank=${hand.rank}`);
      return { playerId: p.userId, hand: p.hand ?? [], evaluated: hand };
    });

    // Sort by hand strength descending
    evaluatedPlayers.sort((a, b) => compareHands(b.evaluated, a.evaluated));
    console.log('[PotDistribution] Sorted by hand strength:', evaluatedPlayers.map(e => ({ id: e.playerId, rank: e.evaluated.rank, desc: e.evaluated.description })));

    // Group players by hand strength into nested arrays
    const strengthGroups: EvaluatedPlayer[][] = [];
    for (const ep of evaluatedPlayers) {
      const last = strengthGroups[strengthGroups.length - 1];
      if (last && compareHands(ep.evaluated, last[0].evaluated) === 0) {
        last.push(ep);
      } else {
        strengthGroups.push([ep]);
      }
    }
    console.log('[PotDistribution] Strength groups:', strengthGroups.map(g => ({ players: g.map(p => p.playerId), rank: g[0].evaluated.rank, desc: g[0].evaluated.description })));

    // Step 2: Calculate total distributable pot chips
    const totalChips = [...this.playerBets.values()].reduce((a, b) => a + b, 0);
    console.log('[PotDistribution] Total chips in playerBets:', totalChips);
    if (totalChips <= 0) {
      console.log('[PotDistribution] No chips to distribute');
      return { pots: [], totalDistributed: 0 };
    }

    // Remaining chips for each player (mutable copy)
    const remaining = new Map<string, number>();
    for (const p of players) {
      remaining.set(p.userId, this.playerBets.get(p.userId) || 0);
    }
    console.log('[PotDistribution] Remaining chips:', Object.fromEntries(remaining));

    const pots: PotDistribution['pots'] = [];
    let totalDistributed = 0;
    let distributableChips = totalChips;
    let loop = 0;

    // Step 3: Loop while there are still distributable chips and active groups
    while (distributableChips > 0 && strengthGroups.length > 0) {
      loop++;
      console.log(`[PotDistribution] Loop #${loop} — distributable=${distributableChips}, groups=${strengthGroups.length}`);

      // Take the first group (highest hand strength = winners of this layer)
      const winners = strengthGroups[0];
      console.log(`[PotDistribution] Loop #${loop} winner group (rank=${winners[0].evaluated.rank} ${winners[0].evaluated.description}):`, winners.map(w => w.playerId));

      // Find the minimum invested chips among this winner group
      let minChips = Infinity;
      for (const w of winners) {
        const chips = remaining.get(w.playerId) || 0;
        console.log(`[PotDistribution] Loop #${loop} winner ${w.playerId} remaining chips: ${chips}`);
        if (chips > 0 && chips < minChips) {
          minChips = chips;
        }
      }

      console.log(`[PotDistribution] Loop #${loop} minChips among winners: ${minChips}`);

      // If no winner has remaining chips, remove this group and continue
      if (minChips === Infinity) {
        console.log(`[PotDistribution] Loop #${loop} no winner has chips — shifting group`);
        strengthGroups.shift();
        continue;
      }

      // Calculate this layer's pot: sum of each player's contribution (up to minChips)
      let layerPot = 0;
      for (const [playerId, chips] of remaining) {
        if (chips > 0) {
          const contributed = Math.min(chips, minChips);
          layerPot += contributed;
          remaining.set(playerId, chips - minChips);
          console.log(`[PotDistribution] Loop #${loop} player ${playerId} contributed=${contributed}, remaining after=${chips - minChips}`);
        }
      }
      console.log(`[PotDistribution] Loop #${loop} layerPot=${layerPot}, remaining after deduction:`, Object.fromEntries(remaining));

      // Distribute equally among winners (floor division)
      const sharePerWinner = Math.floor(layerPot / winners.length);
      const winAmounts: { playerId: string; amount: number }[] = winners.map(w => ({
        playerId: w.playerId,
        amount: sharePerWinner,
      }));
      for (const wa of winAmounts) {
        totalDistributed += wa.amount;
      }
      console.log(`[PotDistribution] Loop #${loop} sharePerWinner=${sharePerWinner}, winAmounts:`, winAmounts);

      // Eligible players for this pot (all with remaining chips > 0)
      // Reduce total distributable chips
      distributableChips -= layerPot;
      console.log(`[PotDistribution] Loop #${loop} distributableChips after deduction: ${distributableChips}`);
    }

    console.log('[PotDistribution] Final result — pots:', pots, 'totalDistributed:', totalDistributed);
    console.log('[PotDistribution] ====== END ======');
    return { pots, totalDistributed };
  }

  /**
   * 执行底池分配并更新玩家筹码
   * @param players - 所有玩家
   * @param communityCards - 公共牌
   * @returns 底池分配结果
   */
  executePotDistribution(players: PlayerInRoom[], communityCards: Card[]): PotDistribution {
    const distribution = this.calculatePotDistribution(players, communityCards);
    
    // 根据分配结果更新玩家筹码
    for (const pot of distribution.pots) {
      for (const win of pot.winAmounts) {
        const player = players.find(p => p.userId === win.playerId);
        if (player) {
          player.chips += win.amount;
        }
      }
    }

    // 清空底池
    this.pot = 0;

    return distribution;
  }
}
