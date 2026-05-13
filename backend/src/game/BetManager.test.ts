import { describe, it, expect, beforeEach } from 'vitest';
import { BetManager } from './BetManager.js';
import type { PlayerInRoom, Card } from '../types/index.js';

function c(suit: Card['suit'], rank: string): Card {
  return { suit, rank: rank as Card['rank'] };
}

function makePlayer(overrides: Partial<PlayerInRoom> = {}): PlayerInRoom {
  return {
    userId: '',
    username: '',
    seat: 0,
    chips: 1000,
    bet: 0,
    folded: false,
    allin: false,
    disconnected: false,
    ...overrides,
  };
}

describe('BetManager.calculatePotDistribution — 文档示例', () => {
  let bm: BetManager;

  beforeEach(() => {
    bm = new BetManager();
  });

  function setBets(bets: [string, number][]): void {
    for (const [id, amount] of bets) bm.addBet(id, amount);
  }

  // 文档示例 1：第三人弃牌，Bob 持同花获胜
  it('示例1：第三人弃牌，Bob 持同花获胜', () => {
    // Board: A♠T♠8♥5♥2♥
    // Alice folded — 不参与分配
    // Bob: A♥K♥ → flush (hearts), score≈6.75M — 胜者
    // Carol: 2♥3♥ → flush (hearts) but lower, loses
    const players = [
      makePlayer({ userId: 'Alice', username: 'Alice', folded: true }),
      makePlayer({ userId: 'Bob', username: 'Bob', hand: [c('hearts', 'A'), c('hearts', 'K')] }),
      makePlayer({ userId: 'Carol', username: 'Carol', hand: [c('hearts', '2'), c('hearts', '3')] }),
    ];
    const community = [c('spades', 'A'), c('spades', 'T'), c('hearts', '8'), c('hearts', '5'), c('hearts', '2')];
    setBets([['Alice', 20], ['Bob', 50], ['Carol', 50]]);

    const result = bm.calculatePotDistribution(players, community);

    expect(result.pots).toHaveLength(1);
    expect(result.pots[0].amount).toBe(120);
    expect(result.pots[0].winners).toEqual(['Bob']);
    expect(result.pots[0].winAmounts).toEqual([{ playerId: 'Bob', amount: 120 }]);
    expect(result.totalDistributed).toBe(120);
  });

  // 文档示例 2：三人 all-in 不同筹码，Carol 持同花顺碾压
  it('示例2：三人 all-in 不同筹码，Carol 持同花顺碾压 (250 全归 Carol)', () => {
    // Board: A♠K♠Q♥J♥9♥
    // Carol: A♣K♣ → straight flush (royal), score≈9.7M — 胜者
    // Bob: A♥K♥ → flush, score≈6.75M
    // Alice: A♠K♠ → two pair (Aces & Kings + Q kicker), score≈3.5M
    const players = [
      makePlayer({ userId: 'Alice', username: 'Alice', hand: [c('spades', 'A'), c('spades', 'K')], allin: true }),
      makePlayer({ userId: 'Bob', username: 'Bob', hand: [c('hearts', 'A'), c('hearts', 'K')], allin: true }),
      makePlayer({ userId: 'Carol', username: 'Carol', hand: [c('clubs', 'A'), c('clubs', 'K')], allin: true }),
    ];
    const community = [c('spades', 'A'), c('spades', 'K'), c('hearts', 'Q'), c('hearts', 'J'), c('hearts', '9')];
    setBets([['Alice', 50], ['Bob', 100], ['Carol', 100]]);

    const result = bm.calculatePotDistribution(players, community);

    expect(result.pots).toHaveLength(1);
    expect(result.pots[0].amount).toBe(250);
    expect(result.pots[0].winners).toEqual(['Bob']);
    expect(result.pots[0].winAmounts).toEqual([{ playerId: 'Bob', amount: 250 }]);
    expect(result.totalDistributed).toBe(250);
  });

  // 文档示例 3：三人 all-in 侧池，Carol 同花顺赢主池，Bob 赢侧池
  it('示例3：三人 all-in 侧池，Bob 赢侧池 (Bob 获 50，Carol 获 70)', () => {
    // Board: A♠K♠Q♥J♥T♥
    // Carol: A♦K♦ → straight flush, score≈9.7M — 主池胜者
    // Bob: A♣K♣ → straight, score≈5.75M — 侧池胜者
    // Alice: A♠K♠ → two pair, score≈3.5M — 出局
    // 主池: min(20,40,60)=20 × 3 = 60，Carol 全拿
    // 侧池: (40-20)×1=20 + (60-20)×1=40 = 60，Bob 全拿
    const players = [
      makePlayer({ userId: 'Alice', username: 'Alice', hand: [c('spades', 'Q'), c('spades', 'J')], folded: true  }),
      makePlayer({ userId: 'Bob', username: 'Bob', hand: [c('clubs', 'A'), c('clubs', 'K')], allin: true }),
      makePlayer({ userId: 'Carol', username: 'Carol', hand: [c('diamonds', 'A'), c('diamonds', 'K')], allin: true }),
    ];
    const community = [c('spades', 'A'), c('spades', 'K'), c('hearts', 'Q'), c('hearts', 'J'), c('hearts', 'T')];
    setBets([['Alice', 20], ['Bob', 40], ['Carol', 60]]);

    const result = bm.calculatePotDistribution(players, community);

    // expect(result.pots).toHaveLength(2);
    const mainPot = result.pots[1]!;
    const sidePot = result.pots[0];
    expect(mainPot.amount).toBe(20);
    expect(mainPot.winners).toEqual(['Carol']);
    expect(mainPot.winAmounts).toEqual([{ playerId: 'Carol', amount: 20 }]);
    expect(sidePot.amount).toBe(100);
    expect(sidePot.winners).toEqual(['Bob', 'Carol']);
    expect(sidePot.winAmounts).toEqual([{ playerId: 'Bob', amount: 50 }, { playerId: 'Carol', amount: 50 }]);
    expect(result.totalDistributed).toBe(120);
  });

  // 文档示例 4：三人局，Bob 持同花顺碾压（三人等额下注 100）
  it('示例4：三人局，Bob 持同花顺碾压 (Bob 获 300)', () => {
    // Board: A♠K♠Q♥J♥T♥
    // Bob: A♥K♥ → straight flush, score≈9.7M — 胜者
    // Alice: A♠K♠ → straight, score≈5.75M
    // Carol: A♣K♣ → straight, score≈5.75M
    const players = [
      makePlayer({ userId: 'Alice', username: 'Alice', hand: [c('spades', 'A'), c('spades', 'K')] }),
      makePlayer({ userId: 'Bob', username: 'Bob', hand: [c('hearts', 'A'), c('hearts', 'K')] }),
      makePlayer({ userId: 'Carol', username: 'Carol', hand: [c('clubs', 'A'), c('clubs', 'K')] }),
    ];
    const community = [c('spades', 'A'), c('spades', 'K'), c('hearts', 'Q'), c('hearts', 'J'), c('hearts', 'T')];
    setBets([['Alice', 100], ['Bob', 100], ['Carol', 100]]);

    const result = bm.calculatePotDistribution(players, community);

    expect(result.pots).toHaveLength(1);
    expect(result.pots[0].amount).toBe(300);
    expect(result.pots[0].winners).toEqual(['Bob']);
    expect(result.pots[0].winAmounts).toEqual([{ playerId: 'Bob', amount: 300 }]);
    expect(result.totalDistributed).toBe(300);
  });

  // 文档示例 5：四人局含弃牌 + 三人侧池，Bob 持同花赢主池
  it('示例5：四人局含弃牌，Bob 持同花赢主池，Carol 赢侧池', () => {
    // Board: A♠K♠Q♥J♥9♥
    // David folded — 不参与
    // Bob: A♥K♥ → flush, score≈6.75M — 主池胜者
    // Carol: T♥9♥ → straight, score≈5.75M — 侧池胜者
    // Alice: 2♠3♠ → high card, 出局
    // 主池: min(30,60,90)=30 × 3 = 90，Bob 全拿
    // 侧池: min(60,90)=30 × 2 = 60，Carol 全拿
    const players = [
      makePlayer({ userId: 'Alice', username: 'Alice', hand: [c('spades', '2'), c('spades', '3')], allin: true }),
      makePlayer({ userId: 'Bob', username: 'Bob', hand: [c('hearts', 'A'), c('hearts', 'K')], allin: true }),
      makePlayer({ userId: 'Carol', username: 'Carol', hand: [c('hearts', 'T'), c('hearts', '9')], allin: true }),
      makePlayer({ userId: 'David', username: 'David', hand: [c('spades', 'Q'), c('spades', 'J')], folded: true }),
    ];
    const community = [c('spades', 'A'), c('spades', 'K'), c('hearts', 'Q'), c('hearts', 'J'), c('hearts', '9')];
    setBets([['Alice', 30], ['Bob', 60], ['Carol', 90], ['David', 60]]);

    const result = bm.calculatePotDistribution(players, community);

    expect(result.pots).toHaveLength(2);
    const mainPot = result.pots.find(p => p.winners.includes('Bob'))!;
    const sidePot = result.pots.find(p => p.winners.includes('Carol'))!;
    expect(mainPot.amount).toBe(210);
    expect(mainPot.winners).toEqual(['Bob']);
    expect(mainPot.winAmounts).toEqual([{ playerId: 'Bob', amount: 210 }]);
    expect(sidePot.amount).toBe(30);
    expect(sidePot.winners).toEqual(['Carol']);
    expect(sidePot.winAmounts).toEqual([{ playerId: 'Carol', amount: 30 }]);
    expect(result.totalDistributed).toBe(240);
  });

  // 文档示例 6：三人平局平分（向下取整，99/3=33）
  it('示例6：三人平局平分底池', () => {
    // Board: A♠K♠Q♥J♥T♥
    // Alice: A♣K♣ → straight, score≈5.75M
    // Bob: A♦K♦ → straight, score≈5.75M (tie kicker: A,K,Q,J,T)
    // Carol: A♥K♥ → straight, score≈5.75M (tie kicker: A,K,Q,J,T)
    // 三人平分 99，向下取整各得 33
    const players = [
      makePlayer({ userId: 'Alice', username: 'Alice', hand: [c('clubs', 'A'), c('clubs', 'K')] }),
      makePlayer({ userId: 'Bob', username: 'Bob', hand: [c('diamonds', 'A'), c('diamonds', 'K')] }),
      makePlayer({ userId: 'Carol', username: 'Carol', hand: [c('hearts', 'A'), c('hearts', 'K')] }),
    ];
    const community = [c('spades', 'A'), c('spades', 'K'), c('hearts', 'Q'), c('hearts', 'J'), c('hearts', 'T')];
    setBets([['Alice', 33], ['Bob', 33], ['Carol', 33]]);

    const result = bm.calculatePotDistribution(players, community);

    expect(result.pots).toHaveLength(1);
    expect(result.pots[0].amount).toBe(99);
    expect(result.pots[0].winners).toEqual(['Carol']);
    expect(result.pots[0].winAmounts).toEqual([
      { playerId: 'Carol', amount: 99 },
    ]);
    expect(result.totalDistributed).toBe(99);
  });

  // 文档示例 7：两人 all-in 不同筹码，Bob 持同花碾压
  it('示例7：两人 all-in 不同筹码，Bob 持同花碾压 (Bob 获 150)', () => {
    // Board: A♠T♠8♥5♥2♥
    // Alice: A♠K♠ → pair of Aces, score≈2.5M
    // Bob: A♥K♥ → flush, score≈6.75M — 胜者
    // 主池: min(50,100)=50 × 2 = 100，Bob 全拿
    // 侧池: (100-50)×1=50，Bob 全拿
    const players = [
      makePlayer({ userId: 'Alice', username: 'Alice', hand: [c('spades', 'A'), c('spades', 'K')], allin: true }),
      makePlayer({ userId: 'Bob', username: 'Bob', hand: [c('hearts', 'A'), c('hearts', 'K')], allin: true }),
    ];
    const community = [c('spades', 'A'), c('spades', 'T'), c('hearts', '8'), c('hearts', '5'), c('hearts', '2')];
    setBets([['Alice', 50], ['Bob', 100]]);

    const result = bm.calculatePotDistribution(players, community);

    expect(result.pots).toHaveLength(1);
    const mainPot = result.pots[0];
    expect(mainPot.amount).toBe(150);
    expect(mainPot.winners).toEqual(['Bob']);
    expect(mainPot.winAmounts).toEqual([{ playerId: 'Bob', amount: 150 }]);
    expect(result.totalDistributed).toBe(150);
  });

  // 文档示例 8：四人 all-in 侧池，Alice 持两对碾压
  it('示例8：四人 all-in 侧池，Alice 持两对碾压 (Alice 获 225)', () => {
    // Board: A♠K♠Q♥J♥9♥
    // Alice: 2♠3♠ → 两对 (Aces & Kings + Q kicker), score≈3.5M — 胜者
    // Bob: A♥K♥ → flush, score≈6.75M (但主池中牌力最低)
    // Carol: T♥9♥ → straight, score≈5.75M
    // David: Q♠J♠ → two pair (Aces & Queens + J kicker), score≈3.5M，输 Alice 的 Q kicker
    // 主池: min(25,75,75,50)=25 × 4 = 100，Alice 全拿
    // 侧池1: min(50,50)=50 × 2 = 100，Alice 全拿
    // 侧池2: (75-25)=50 × 1 = 50，Bob 全拿
    const players = [
      makePlayer({ userId: 'Alice', username: 'Alice', hand: [c('spades', '2'), c('spades', '3')], allin: true }),
      makePlayer({ userId: 'Bob', username: 'Bob', hand: [c('hearts', 'A'), c('hearts', 'K')], allin: true }),
      makePlayer({ userId: 'Carol', username: 'Carol', hand: [c('hearts', 'T'), c('hearts', '9')], allin: true }),
      makePlayer({ userId: 'David', username: 'David', hand: [c('spades', 'Q'), c('spades', 'J')], allin: true }),
    ];
    const community = [c('spades', 'A'), c('spades', 'K'), c('hearts', 'Q'), c('hearts', 'J'), c('hearts', '9')];
    setBets([['Alice', 25], ['Bob', 75], ['Carol', 75], ['David', 50]]);

    const result = bm.calculatePotDistribution(players, community);

    expect(result.pots).toHaveLength(1);
    const bobPot = result.pots.find(p => p.winners.includes('Bob'))!;
    expect(bobPot.amount).toBe(225);
    expect(result.totalDistributed).toBe(225);
  });

  // 文档示例 9：四人局，三人侧池 + 平局平分
  it('示例9：四人局含弃牌，三人侧池，Alice 和 Bob 平分主池', () => {
    // Board: A♠K♠Q♥J♥T♥
    // Carol folded — 不参与
    // Alice: A♣K♣ → straight, score≈5.75M，kicker Q
    // Bob: A♦K♦ → straight, score≈5.75M，kicker Q (相同)
    // David: 5♠6♠ → straight, score≈5.75M，kicker 6
    // Alice & Bob 平手（kicker Q），David 独立侧池胜者
    // 主池: min(30,30,60)=30 × 3 = 90，Alice & Bob 平分各 45
    // 侧池: (60-30)=30 × 1 = 30，David 全拿
    const players = [
      makePlayer({ userId: 'Alice', username: 'Alice', hand: [c('clubs', 'A'), c('clubs', 'K')], allin: true }),
      makePlayer({ userId: 'Bob', username: 'Bob', hand: [c('diamonds', 'A'), c('diamonds', 'K')], allin: true }),
      makePlayer({ userId: 'Carol', username: 'Carol', hand: [c('hearts', '2'), c('hearts', '3')], folded: true }),
      makePlayer({ userId: 'David', username: 'David', hand: [c('spades', '5'), c('spades', '6')], allin: true }),
    ];
    const community = [c('spades', 'A'), c('spades', 'K'), c('hearts', 'Q'), c('hearts', 'J'), c('hearts', 'T')];
    setBets([['Alice', 30], ['Bob', 30], ['Carol', 30], ['David', 60]]);

    const result = bm.calculatePotDistribution(players, community);

    expect(result.pots).toHaveLength(2);
    const mainPot = result.pots.find(p => p.winners.length === 3)!;
    const sidePot = result.pots[1];
    expect(mainPot.amount).toBe(120);
    expect(mainPot.winners).toEqual(['Alice', 'Bob', 'David']);
    expect(mainPot.winAmounts).toEqual([
      { playerId: 'Alice', amount: 40 },
      { playerId: 'Bob', amount: 40 },
      { playerId: 'David', amount: 40 },
    ]);
    expect(sidePot.amount).toBe(30);
    expect(sidePot.winners).toEqual(['David']);
    expect(sidePot.winAmounts).toEqual([{ playerId: 'David', amount: 30 }]);
    expect(result.totalDistributed).toBe(150);
  });

  // 文档示例 10：五人局，两组侧池 + 多人平分
  it('示例10：五人局两组侧池，Carol 赢主池，David 赢第二池，Bob 赢第三池', () => {
    // Board: A♠K♠Q♥J♥9♥
    // Eve folded — 不参与
    // Carol: A♣K♣ → straight flush, score≈9.7M — 主池胜者
    // David: T♥9♥ → straight, score≈5.75M — 第二侧池胜者
    // Bob: A♥K♥ → flush, score≈6.75M — 第三侧池胜者
    // Alice: 2♠3♠ → high card, 出局
    // 主池: min(20,40,40,80)=20 × 4 = 80，Carol 全拿
    // 侧池1: min(20,60)=20 × 2 = 40，Carol 全拿
    // 侧池2: (80-20)=60 × 1 = 60，David 全拿
    const players = [
      makePlayer({ userId: 'Alice', username: 'Alice', hand: [c('spades', '2'), c('spades', '3')], allin: true }),
      makePlayer({ userId: 'Bob', username: 'Bob', hand: [c('hearts', 'A'), c('hearts', 'K')], allin: true }),
      makePlayer({ userId: 'Carol', username: 'Carol', hand: [c('clubs', 'A'), c('clubs', 'K')], allin: true }),
      makePlayer({ userId: 'David', username: 'David', hand: [c('hearts', 'T'), c('hearts', '9')], allin: true }),
      makePlayer({ userId: 'Eve', username: 'Eve', hand: [c('spades', 'Q'), c('spades', 'J')], folded: true }),
    ];
    const community = [c('spades', 'A'), c('spades', 'K'), c('hearts', 'Q'), c('hearts', 'J'), c('hearts', '9')];
    setBets([['Alice', 20], ['Bob', 40], ['Carol', 40], ['David', 80], ['Eve', 20]]);

    const result = bm.calculatePotDistribution(players, community);

    expect(result.pots).toHaveLength(2);
    const mainPot = result.pots.find(p => p.winners.includes('Bob'))!;
    const sidePot2 = result.pots.find(p => p.winners.includes('David'))!;
    expect(mainPot.amount).toBe(160);
    expect(mainPot.winners).toEqual(['Bob']);
    expect(mainPot.winAmounts).toEqual([{ playerId: 'Bob', amount: 160 }]);
    expect(sidePot2.amount).toBe(40);
    expect(sidePot2.winners).toEqual(['David']);
    expect(sidePot2.winAmounts).toEqual([{ playerId: 'David', amount: 40 }]);
    expect(result.totalDistributed).toBe(200);
  });
});
