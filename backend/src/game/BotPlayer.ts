/**
 * 机器人玩家管理器
 * 管理所有机器人玩家的决策逻辑
 */

import type { Card } from '../types/index.js';
import { evaluateHand } from './HandEvaluator.js';

export interface BotDecision {
  action: 'fold' | 'check' | 'call' | 'raise' | 'allin';
  amount?: number;
}

export interface BotConfig {
  playStyle: 'tight' | 'loose' | 'aggressive' | 'passive'; // 紧/松 + 激进/被动
  raiseFrequency: number;  // 0-1, 强牌加注频率
  callFrequency: number;   // 0-1, 边缘牌跟注频率
}

const DEFAULT_BOT_NAMES = [
  '小智', '小红', '小明', '老王', '阿杰', '石头', '剪刀', '布丁',
  '小鱼', '熊猫', '老虎', '狮子', '狐狸', '兔子', '猴子', '猩猩'
];

export class BotPlayer {
  public readonly botId: string;
  public readonly username: string;
  public chips: number;
  public hand: Card[] | undefined;
  public config: BotConfig;
  
  // 跟踪历史决策
  private decisionHistory: { action: string; handStrength: number }[] = [];

  constructor(botId: string, chips: number, config?: Partial<BotConfig>) {
    this.botId = botId;
    this.username = DEFAULT_BOT_NAMES[Math.floor(Math.random() * DEFAULT_BOT_NAMES.length)] + 
                    Math.floor(Math.random() * 100);
    this.chips = chips;
    this.config = {
      playStyle: 'loose',
      raiseFrequency: 0.4,
      callFrequency: 0.6,
      ...config,
    };
  }

  setHand(cards: Card[]): void {
    this.hand = cards;
  }

  clearHand(): void {
    this.hand = undefined;
  }

  /**
   * 评估手牌强度 (0-1)
   */
  private evaluateHandStrength(communityCards: Card[], round: string): number {
    if (!this.hand) return 0;

    const holeCards = this.hand;
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

    // 预计算常见牌型用于快速查找
    const holeRanks = holeCards.map(c => ranks.indexOf(c.rank)).sort((a, b) => b - a);
    const [r1, r2] = holeRanks;
    const isPair = holeCards[0].rank === holeCards[1].rank;
    const isSuited = holeCards[0].suit === holeCards[1].suit;
    const isConnected = Math.abs(r1 - r2) === 1;
    const isOneGap = Math.abs(r1 - r2) === 2;

    // Preflop 手牌强度查对表 (基于扑克理论)
    if (round === 'preflop') {
      const highCard = Math.max(r1, r2);
      const lowCard = Math.min(r1, r2);

      // 口袋对子
      if (isPair) {
        const pairRank = r1;
        // 22-99 低对子: 0.35-0.45
        // TT-JJ 中对子: 0.50-0.60
        // QQ-AA 高对子: 0.70-0.95
        return 0.30 + (pairRank / 12) * 0.65;
      }

      // 高牌组合
      let strength = 0;

      // 基础高牌分
      if (highCard >= 12) { // A
        strength = 0.55;
      } else if (highCard >= 11) { // K
        strength = 0.45;
      } else if (highCard >= 10) { // Q
        strength = 0.35;
      } else if (highCard >= 9) { // J
        strength = 0.28;
      } else {
        strength = 0.20;
      }

      // 次要高牌加成
      strength += (lowCard / 12) * 0.15;

      // 同花加成
      if (isSuited) {
        strength += 0.08;
      }

      // 连牌加成
      if (isConnected) {
        strength += 0.06;
      } else if (isOneGap) {
        strength += 0.03;
      }

      // 特殊加成：AXs、KXs、QXs
      if (isSuited && lowCard >= 11) {
        strength += 0.05;
      }

      return Math.min(1, Math.max(0, strength));
    }

    // Flop/Turn/River: 使用完整手牌评估
    if (communityCards.length > 0) {
      try {
        const evaluated = evaluateHand(holeCards, communityCards);
        const handRank = evaluated.rank;

        // 根据牌型基础分
        switch (handRank) {
          case 'straight_flush': return 0.98;
          case 'four_of_a_kind': return 0.95;
          case 'full_house': return 0.90;
          case 'flush': return 0.85;
          case 'straight': return 0.80;
          case 'three_of_a_kind': return 0.70;
          case 'two_pair': return 0.55;
          case 'pair': return 0.40 + (r1 / 12) * 0.20;
          default:
            // 高牌：加入公共牌考虑
            return (r1 / 12) * 0.30 + (communityCards.length / 5) * 0.10;
        }
      } catch {
        return (r1 / 12) * 0.30;
      }
    }

    return 0;
  }

  /**
   * 根据游戏状态做出决策
   */
  decide(
    communityCards: Card[],
    round: string,
    toCall: number,
    bet: number,
    minRaise: number,
    maxChips: number
  ): BotDecision {
    if (!this.hand) {
      return { action: 'fold' };
    }

    const strength = this.evaluateHandStrength(communityCards, round);
    const canCheck = toCall === 0;
    
    // 记录决策
    this.decisionHistory.push({ action: '?', handStrength: strength });

    // 根据手牌强度和游戏风格决策
    switch (this.config.playStyle) {
      case 'tight':   // 紧：只玩好牌
        return this.tightDecision(strength, canCheck, toCall, minRaise, maxChips);
      
      case 'loose':   // 松：玩更多牌
        return this.looseDecision(strength, canCheck, toCall, minRaise, maxChips);
      
      case 'aggressive': // 激进：倾向于加注
        return this.aggressiveDecision(strength, canCheck, toCall, minRaise, maxChips);
      
      case 'passive': // 被动：倾向于跟注/过牌
        return this.passiveDecision(strength, canCheck, toCall, minRaise, maxChips);
      
      default:
        return this.looseDecision(strength, canCheck, toCall, minRaise, maxChips);
    }
  }

  private tightDecision(strength: number, canCheck: boolean, toCall: number, minRaise: number, maxChips: number): BotDecision {
    // 紧的风格：只玩好牌

    // 好牌：raise 或 call
    if (strength >= 0.6) {
      if (canCheck) {
        return Math.random() < 0.4 ? { action: 'raise', amount: minRaise } : { action: 'check' };
      }
      if (strength >= 0.75 && this.chips >= minRaise) {
        return { action: 'raise', amount: this.getRaiseAmount(minRaise, maxChips) };
      }
      return { action: 'call' };
    }

    // 边缘牌：只免费玩
    if (strength >= 0.35 && canCheck) {
      return { action: 'check' };
    }

    // 差牌弃牌
    return { action: 'fold' };
  }

  private looseDecision(strength: number, canCheck: boolean, toCall: number, minRaise: number, maxChips: number): BotDecision {
    // 松的风格：更多牌参与

    // 强牌：raise 或 call
    if (strength >= 0.65) {
      if (canCheck) {
        return Math.random() < 0.5 ? { action: 'raise', amount: minRaise } : { action: 'check' };
      }
      if (strength >= 0.8 && this.chips >= minRaise) {
        return { action: 'raise', amount: this.getRaiseAmount(minRaise, maxChips) };
      }
      return { action: 'call' };
    }

    // 中等强度：check 或 call
    if (strength >= 0.4) {
      if (canCheck) {
        return { action: 'check' };
      }
      // 跟注概率基于强度
      if (Math.random() < strength + 0.3) {
        return { action: 'call' };
      }
      return { action: 'fold' };
    }

    // 差牌：有bet就fold，免费游戏可以check
    if (canCheck) {
      return { action: 'check' };
    }
    return { action: 'fold' };
  }

  private aggressiveDecision(strength: number, canCheck: boolean, toCall: number, minRaise: number, maxChips: number): BotDecision {
    // 激进风格：倾向于加注
    if (strength >= 0.45) {
      if (canCheck) {
        return Math.random() < 0.7 ? { action: 'raise', amount: minRaise } : { action: 'check' };
      }
      // 经常加注
      if (this.chips >= minRaise) {
        const raiseAmount = this.getRaiseAmount(minRaise, maxChips);
        return { action: 'raise', amount: raiseAmount };
      }
      return { action: 'call' };
    }

    if (strength >= 0.3 && canCheck) {
      return { action: 'check' };
    }

    // 差牌弃牌
    return { action: 'fold' };
  }

  private passiveDecision(strength: number, canCheck: boolean, toCall: number, minRaise: number, maxChips: number): BotDecision {
    // 被动风格：倾向于跟注/过牌

    // 好牌才加注
    if (strength >= 0.7) {
      if (canCheck) {
        return Math.random() < 0.2 ? { action: 'raise', amount: minRaise } : { action: 'check' };
      }
      if (this.chips >= minRaise && Math.random() < 0.3) {
        return { action: 'raise', amount: minRaise };
      }
      return { action: 'call' };
    }

    // 中等牌力：倾向跟注
    if (strength >= 0.4) {
      if (canCheck) {
        return { action: 'check' };
      }
      // 被动跟注
      if (Math.random() < strength + 0.4) {
        return { action: 'call' };
      }
      return { action: 'fold' };
    }

    if (canCheck) {
      return { action: 'check' };
    }
    return { action: 'fold' };
  }

  private getRaiseAmount(minRaise: number, maxChips: number): number {
    // 随机加注金额 (1x-3x min raise)
    const multiplier = 1 + Math.random() * 2;
    const amount = Math.min(Math.floor(minRaise * multiplier), maxChips);
    return Math.max(amount, minRaise);
  }
}
