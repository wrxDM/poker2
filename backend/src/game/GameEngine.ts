import { v4 as uuidv4 } from 'uuid';
import type {
  Card, GameRound, HandAction, PlayerInRoom,
  PublicRoomState, RoomState,
} from '../types/index.js';
import { createDeck, shuffleDeck, dealCard } from './Deck.js';
import { evaluateHand, compareHands } from './HandEvaluator.js';
import { BetManager } from './BetManager.js';
import { BotPlayer } from './BotPlayer.js';
import { UserService } from '../services/UserService.js';

const DEBUG = true;
const log = {
  debug: (...args: unknown[]) => DEBUG && console.debug(`[GameEngine]`, ...args),
  info: (...args: unknown[]) => console.log(`[GameEngine]`, ...args),
  warn: (...args: unknown[]) => console.warn(`[GameEngine]`, ...args),
  error: (...args: unknown[]) => console.error(`[GameEngine]`, ...args),
};

const ROUND_ORDER: GameRound[] = ['preflop', 'flop', 'turn', 'river', 'showdown'];

interface ActionResult {
  success: boolean;
  error?: string;
  state?: PublicRoomState;
}

interface ShowdownResult {
  winners: { playerId: string; username: string; hand: Card[]; evaluatedHand: ReturnType<typeof evaluateHand>; amount: number }[];
  pots: { amount: number; winners: string[] }[];
  communityCards: Card[];
}

type EventCallback = (event: string, data: unknown) => void;

export class GameEngine {
  private room: RoomState;
  private betManager: BetManager;
  private onEvent: EventCallback;
  private actionTimer?: ReturnType<typeof setTimeout>;
  private actionTimeoutMs = 350000;
  private bots: Map<string, BotPlayer> = new Map();
  private botActionDelay = 1500; // 机器人延迟决策时间(ms)
  private userService: UserService;
  // 保存每个玩家的总下注（跨所有轮次），用于摊牌时计算底池

  constructor(params: {
    roomId: string;
    name: string;
    blindSmall: number;
    blindBig: number;
    onEvent: EventCallback;
    userService: UserService;
  }) {
    log.debug('GameEngine 初始化中...', { roomId: params.roomId, name: params.name, blinds: `${params.blindSmall}/${params.blindBig}` });
    this.userService = params.userService;
    this.room = {
      roomId: params.roomId,
      name: params.name,
      blindSmall: params.blindSmall,
      blindBig: params.blindBig,
      status: 'waiting',
      players: [],
      communityCards: [],
      pot: 0,
      currentTurn: -1,
      round: 'waiting',
      dealerSeat: 0,
      smallBlindSeat: 0,
      bigBlindSeat: 0,
      currentBet: 0,
      lastRaise: 0,
      createdAt: Date.now(),
      deck: [],
    };
    this.betManager = new BetManager(params.blindBig);
    this.onEvent = params.onEvent;
    log.debug('GameEngine 初始化完成', { roomId: this.room.roomId });
  }

  // ── Room Management ──────────────────────────────────────

  addPlayer(userId: string, username: string, chips: number): PlayerInRoom {
    log.debug(`addPlayer: ${username}(${userId}) 加入房间，筹码: ${chips}`);
    const seat = this.findEmptySeat();
    const player: PlayerInRoom = {
      userId, username, seat, chips, bet: 0, totalBet: 0, minRaise: 0,
      folded: false, allin: false, disconnected: false,
    };
    this.room.players.push(player);
    log.debug(`玩家座位分配: ${username} -> 座位 ${seat}，当前房间玩家数: ${this.room.players.length}`);
    this.emitState();
    return player;
  }

  /**
   * 添加机器人玩家
   */
  addBot(chips: number = 500, playStyle?: 'tight' | 'loose' | 'aggressive' | 'passive'): string {
    log.debug(`addBot: 正在添加机器人，筹码: ${chips}，风格: ${playStyle || 'loose'}`);
    const botId = `bot_${uuidv4().slice(0, 8)}`;
    const bot = new BotPlayer(botId, { playStyle: playStyle || 'loose' });
    this.bots.set(botId, bot);
    log.debug(`机器人实例创建: ${botId}，用户名: ${bot.username}`);

    const seat = this.findEmptySeat();
    const player: PlayerInRoom = {
      userId: botId,
      username: bot.username,
      seat,
      chips,
      bet: 0,
      totalBet: 0,
      minRaise: 0,
      folded: false,
      allin: false,
      disconnected: false,
      isBot: true,
    };
    this.room.players.push(player);
    log.debug(`机器人座位分配: ${bot.username} -> 座位 ${seat}，当前房间玩家数: ${this.room.players.length}`);
    this.emitState();
    return botId;
  }

  /**
   * 获取机器人
   */
  getBot(botId: string): BotPlayer | undefined {
    return this.bots.get(botId);
  }

  /**
   * 移除机器人
   */
  removeBot(botId: string): void {
    this.bots.delete(botId);
    this.removePlayer(botId);
  }

  /**
   * 获取房间内机器人数量
   */
  getBotCount(): number {
    return this.bots.size;
  }

  removePlayer(userId: string): void {
    log.debug(`removePlayer: 移除玩家 ${userId}`);
    // 如果是机器人，也从 bots map 中移除
    if (userId.startsWith('bot_')) {
      log.debug(`removePlayer: 从 bots map 中移除 ${userId}`);
      this.bots.delete(userId);
    } else {
      // 真实玩家离开时，同步剩余筹码到 UserService
      const player = this.room.players.find(p => p.userId === userId);
      if (player) {
        this.userService.setChips(userId, player.chips);
        log.debug(`removePlayer: 同步玩家 ${player.username} 剩余筹码 ${player.chips} 到 UserService`);
      }
      if (this.room.currentTurn === player?.seat) {
        this.onActionTimeout();
      }
    }
    this.room.players = this.room.players.filter(p => p.userId !== userId);
    log.debug(`removePlayer: 玩家已移除，当前房间玩家数: ${this.room.players.length}`);
    this.emitState();
  }

  getPlayer(userId: string): PlayerInRoom | undefined {
    return this.room.players.find(p => p.userId === userId);
  }

  getRoom(): RoomState {
    return this.room;
  }

  getPublicState(): PublicRoomState {
    this.room.pot = this.betManager.getPot();
    this.room.lastRaise = this.betManager.getLastRaise();
    this.room.currentBet = this.betManager.getCurrentBet();
    const { deck: _, ...rest } = this.room;
    return {
      ...rest,
      players: this.room.players.map(p => {
        p.minRaise = this.betManager.getMinRaise(p);
        const { hand: __, ...pub } = p;
        return pub;
      }),
      playerCount: this.room.players.length,
    };
  }

  getPlayerHand(userId: string): Card[] | undefined {
    return this.getPlayer(userId)?.hand;
  }

  private findEmptySeat(): number {
    const taken = new Set(this.room.players.map(p => p.seat));
    for (let i = 0; i < 9; i++) {
      if (!taken.has(i)) return i;
    }
    return this.room.players.length;
  }

  // ── Game Flow ─────────────────────────────────────────────

  startGame(): ActionResult {
    log.info('========================================');
    log.info('[startGame] 尝试开始游戏');
    log.debug(`当前玩家数: ${this.room.players.length}，房间状态: ${this.room.status}`);

    if (this.room.players.length < 2) {
      log.warn(`[startGame] 玩家数不足: ${this.room.players.length} < 2`);
      return { success: false, error: '需要至少2名玩家才能开始' };
    }
    if (this.room.players.some(p => p.chips <= this.room.blindBig)) {
      log.warn('[startGame] 有玩家筹码不足');
      return { success: false, error: '所有玩家需要有筹码才能开始' };
    }

    return this.beginHand();
  }

  private beginHand(): ActionResult {
    log.debug('[beginHand] 开始发牌...');
    this.room.status = 'playing';
    this.room.round = 'preflop';
    this.room.deck = shuffleDeck(createDeck());
    log.debug(`[beginHand] 牌堆创建并洗牌完成，剩余牌数: ${this.room.deck.length}`);
    this.room.pot = 0;
    this.betManager.resetAll(this.room.players);
    // 重置每局的下注记录（用于摊牌时计算底池）

    // Reset player states
    for (const p of this.room.players) {
      p.bet = 0;
      p.folded = false;
      p.allin = false;
      p.hand = undefined;
      p.lastAction = undefined;
    }

    // Deal hole cards
    log.debug('[beginHand] 开始发手牌...');
    for (const p of this.room.players) {
      const { card: c1, remainingDeck: d1 } = dealCard(this.room.deck);
      const { card: c2, remainingDeck: d2 } = dealCard(d1);
      p.hand = [c1, c2];
      this.room.deck = d2;
      log.debug(`  ${p.username}: ${c1.suit}${c1.rank} ${c2.suit}${c2.rank}`);

      if (p.userId.startsWith('bot_')) {
        const bot = this.bots.get(p.userId);
        if (bot) {
          bot.setHand([c1, c2]);
        }
      }
    }

    // Post blinds
    log.debug('[beginHand] 开始下盲注...');

    // Store small/big blind seat positions
    this.room.smallBlindSeat = this.getNextActiveSeat(this.room.dealerSeat);
    this.room.bigBlindSeat = this.getNextActiveSeat(this.room.smallBlindSeat);
    this.postBlinds();

    // UTG 
    this.room.currentTurn = this.getNextActiveSeat(this.room.bigBlindSeat);
    const firstPlayer = this.room.players.find(p => p.seat === this.room.currentTurn);
    log.debug(`[beginHand] 庄家座位: ${this.room.dealerSeat}，当前玩家: ${firstPlayer?.username}，座位: ${this.room.currentTurn}`);

    this.emitState();
    this.onEvent('game:started', { roomId: this.room.roomId });

    // Notify each player of their hand (only real players)
    for (const p of this.room.players) {
      if (p.hand && !p.userId.startsWith('bot_')) {
        this.onEvent('hand:dealt', { userId: p.userId, cards: p.hand });
      }
    }

    log.info(`[beginHand] 游戏开始！当前回合: ${this.room.round}，底池: ${this.room.pot}，剩余牌数: ${this.room.deck.length}`);

    // 如果当前是机器人回合，开始机器人决策
    this.checkAndExecuteBotAction();

    return { success: true, state: this.getPublicState() };
  }

  private postBlinds(): void {
    log.debug('[postBlinds] 开始下盲注...');
    const players = this.room.players;

    // Small blind: dealer seat
    const sbSeat = this.room.smallBlindSeat;
    const sbPlayer = players.find(p => p.seat === sbSeat);
    if (sbPlayer) {
      const sbAmount = Math.min(this.room.blindSmall, sbPlayer.chips);
      this.betManager.addBet(sbPlayer, sbAmount);
      log.debug(`[postBlinds] 小盲: ${sbPlayer.username} 下注 ${sbAmount}，剩余筹码: ${sbPlayer.chips}`);
    }

    // Big blind: seat after dealer
    const bbSeat = this.getNextActiveSeat(sbSeat);
    const bbPlayer = players.find(p => p.seat === bbSeat);
    if (bbPlayer) {
      const bbAmount = Math.min(this.room.blindBig, bbPlayer.chips);
      this.betManager.addBet(bbPlayer, bbAmount);
      log.debug(`[postBlinds] 大盲: ${bbPlayer.username} 下注 ${bbAmount}，剩余筹码: ${bbPlayer.chips}`);
    }
    log.debug(`[postBlinds] 盲注完成，当前底池: ${this.room.pot}，当前下注: ${this.betManager.getCurrentBet()}`);
  }

  handleAction(userId: string, action: HandAction, amount?: number): ActionResult {
    log.debug(`[handleAction] 收到动作: ${userId} -> ${action}${amount ? ` (金额: ${amount})` : ''}`);
    const player = this.getPlayer(userId);
    if (!player) {
      log.warn(`[handleAction] 玩家不在房间中: ${userId}`);
      return { success: false, error: '玩家不在房间中' };
    }
    if (player.folded) {
      log.warn(`[handleAction] 玩家已弃牌: ${player.username}`);
      return { success: false, error: '玩家已弃牌' };
    }
    if (player.allin) {
      log.warn(`[handleAction] 玩家已全下: ${player.username}`);
      return { success: false, error: '玩家已全下' };
    }
    if (player.seat !== this.room.currentTurn) {
      log.warn(`[handleAction] 不是玩家回合: ${player.username} (座位: ${player.seat})，当前应该是: ${this.room.currentTurn}`);
      return { success: false, error: '不是你的回合' };
    }

    // 禁止真实玩家对机器人操作
    if (!userId.startsWith('bot_')) {
      this.clearActionTimer();
    }
    
    const result = this.processAction(player, action, amount);
    log.debug(`[handleAction] 动作处理结果: ${result.success ? '成功' : '失败'}${result.error ? ` - ${result.error}` : ''}`);
    this.emitState();

    if (result.success) {
      log.debug(`[handleAction] 动作成功: ${player.username} 执行了 ${action}，当前底池: ${this.room.pot}`);
      this.onEvent('player:actioned', { playerId: userId, action, amount });
      this.advanceGame();
    } else {
      if (!userId.startsWith('bot_')) {
        this.startActionTimer();
      }
    }

    return result;
  }

  private processAction(player: PlayerInRoom, action: HandAction, amount?: number): ActionResult {
    const currentBet = this.betManager.getCurrentBet();
    const playerBet = player.bet;
    const toCall = currentBet - playerBet;
    log.debug(`[processAction] ${player.username} 尝试 ${action}，当前下注: ${currentBet}，玩家下注: ${playerBet}，需跟注: ${toCall}`);
    player.hasAct = true;
    switch (action) {
      case 'fold':
        player.folded = true;
        player.lastAction = 'fold';
        log.debug(`[processAction] ${player.username} 弃牌`);
        return { success: true, state: this.getPublicState() };

      case 'check':
        if (toCall > 0) {
          log.debug(`[processAction] ${player.username} 无法 check，需要跟注 ${toCall}`);
          return { success: false, error: '无法 check，需要跟注' };
        }
        player.lastAction = 'check';
        log.debug(`[processAction] ${player.username} 看牌`);
        return { success: true, state: this.getPublicState() };

      case 'call': {
        const callAmount = Math.min(toCall, player.chips);
        this.betManager.addBet(player, callAmount);
        if (player.chips === 0) {
          player.allin = true;
          log.debug(`[processAction] ${player.username} 跟注后全下！金额: ${callAmount}`);
        } else {
          log.debug(`[processAction] ${player.username} 跟注: ${callAmount}，剩余筹码: ${player.chips}`);
        }
        player.lastAction = 'call';
        this.room.pot = this.betManager.getPot();
        return { success: true, state: this.getPublicState() };
      }

      case 'raise': {
        if (!amount) {
          log.warn(`[processAction] 加注未指定金额`);
          return { success: false, error: '加注需要指定金额' };
        }
        const minRaise = this.betManager.getMinRaise(player);
        if (amount < minRaise) {
          log.warn(`[processAction] 加注金额不足: 最小加注： ${minRaise}`);
          return { success: false, error: '加注金额不足' };
        }
        if (amount > player.chips) {
          log.warn(`[processAction] ${player.username} 筹码不足: 需要 ${amount}，拥有 ${player.chips}`);
          return { success: false, error: '筹码不足' };
        }
        this.betManager.addBet(player, amount);
        player.lastAction = 'raise';
        return { success: true, state: this.getPublicState() };
      }

      case 'allin': {
        const allInAmount = player.chips - player.bet;
        player.allin = true;
        this.betManager.addBet(player, allInAmount);
        player.lastAction = 'allin';
        return { success: true, state: this.getPublicState() };
      }

      default:
        log.warn(`[processAction] 未知动作: ${action}`);
        return { success: false, error: '未知操作' };
    }
  }

  private advanceGame(): void {
    log.debug('[advanceGame] ===== 游戏流程推进 =====');
    // 清除当前回合的计时器
    this.clearActionTimer();

    // 检查是否有足够的玩家继续（排除已弃牌的，但包含 all-in 的玩家）
    const activePlayers = this.room.players.filter(p => !p.folded && !p.allin);
    const unfolderPlayers = this.room.players.filter(p => !p.folded); // 包含 all-in
    log.debug(`[advanceGame] 当前活跃玩家数: ${activePlayers.length}，未弃牌玩家数: ${unfolderPlayers.length}`);
    if (activePlayers.length > 0) {
      log.debug(`[advanceGame] 活跃玩家: ${activePlayers.map(p => `${p.username}(${p.seat})`).join(', ')}`);
    }

    // 如果只剩1个未弃牌玩家（可能 all-in），直接获胜，不进入摊牌
    if (unfolderPlayers.length === 1) {
      log.info(`[advanceGame] 仅剩1名未弃牌玩家 ${unfolderPlayers[0].username}，直接获胜`);
      const winner = unfolderPlayers[0];
      winner.chips += this.room.pot;
      log.info(`[advanceGame] ${winner.username} 获得底池 ${this.room.pot}，当前总筹码: ${winner.chips}`);
      const finalPot = this.room.pot;
      this.room.pot = 0;
      this.room.status = 'finished';
      this.room.round = 'finished';
      this.onEvent('game:showdown', {
        roomId: this.room.roomId,
        winners: [{
          playerId: winner.userId,
          username: winner.username,
          hand: winner.hand ?? [],
          evaluatedHand: { rank: 'high_card' as const, score: 0, kickers: [], description: '对手弃牌获胜' },
          amount: finalPot,
        }],
        communityCards: this.room.communityCards,
        pots: [{ amount: finalPot, winners: [winner.userId] }],
      });
      this.emitState();
      return;
    }

    // 检查当前轮次是否结束
    const currentRoundComplete = this.isRoundComplete();
    log.debug(`[advanceGame] 轮次 ${this.room.round} 完成检查: ${currentRoundComplete}`);
    
    if (currentRoundComplete) {
      // 检查是否所有玩家都 allin（无需继续发牌，直接摊牌）
      const allPlayersAllIn = unfolderPlayers.length > 0 && unfolderPlayers.every(p => p.allin);
      
      if (allPlayersAllIn) {
        log.info(`[advanceGame] 所有未弃牌玩家都已 allin，直接进入摊牌`);
        this.room.round = 'showdown';
        this.showdown();
        return;
      }
      
      // 进入下一轮
      const currentIndex = ROUND_ORDER.indexOf(this.room.round as GameRound);
      log.debug(`[advanceGame] 轮次 ${this.room.round} 完成，进入下一轮，当前索引: ${currentIndex}`);
      
      if (currentIndex < ROUND_ORDER.length - 2) {
        // 下一轮
        this.room.round = ROUND_ORDER[currentIndex + 1];
        this.betManager.resetRound(this.room.players);
        this.room.lastRaise = 0;
        log.info(`[advanceGame] >>>>>>>>> 进入 ${this.room.round.toUpperCase()} <<<<<<<<`);
        
        if (this.room.round === 'flop') {
          // 发3张公共牌
          const { card: c1, remainingDeck: d1 } = dealCard(this.room.deck);
          const { card: c2, remainingDeck: d2 } = dealCard(d1);
          const { card: c3, remainingDeck: d3 } = dealCard(d2);
          this.room.communityCards = [c1, c2, c3];
          this.room.deck = d3;
          log.debug(`[advanceGame] 发翻牌: ${c1.suit}${c1.rank} ${c2.suit}${c2.rank} ${c3.suit}${c3.rank}，牌堆剩余: ${this.room.deck.length}`);
        } else if (this.room.round === 'turn' || this.room.round === 'river') {
          // 发1张公共牌
          const { card, remainingDeck } = dealCard(this.room.deck);
          this.room.communityCards.push(card);
          this.room.deck = remainingDeck;
          const cardDesc = `${card.suit}${card.rank}`;
          const allCards = this.room.communityCards.map(c => `${c.suit}${c.rank}`).join(' ');
          log.debug(`[advanceGame] 发${this.room.round === 'turn' ? '转' : '河'}牌: ${cardDesc}，公共牌: ${allCards}，牌堆剩余: ${this.room.deck.length}`);
        }

        // 翻后从小盲开始行动（第一个活跃玩家，从小盲开始找）
        const sbPlayer = this.room.players.find(p => !p.folded && !p.allin && p.seat === this.room.smallBlindSeat);
        if (sbPlayer) {
          this.room.currentTurn = sbPlayer.seat;
          log.debug(`[advanceGame] 翻后第一行动玩家(小盲): ${sbPlayer.username}，座位: ${sbPlayer.seat}`);
        } else {
          // 小盲已弃牌或allin，找下一个活跃玩家
          let next = this.getNextActiveSeat(this.room.smallBlindSeat);
          while (next !== this.room.smallBlindSeat) {
            const p = this.room.players.find(p2 => p2.seat === next);
            if (p && !p.folded && !p.allin) {
              this.room.currentTurn = p.seat;
              log.debug(`[advanceGame] 翻后第一行动玩家: ${p.username}，座位: ${p.seat}`);
              break;
            }
          }
        }
        
        this.onEvent('round:started', { round: this.room.round, communityCards: this.room.communityCards });
      } else {
        // 摊牌
        log.info('[advanceGame] 进入摊牌阶段');
        this.room.round = 'showdown';
        this.showdown();
        return;
      }
    } else {
      // 轮到下一个玩家
      const prevTurn = this.room.currentTurn;
      this.room.currentTurn = this.getNextActiveSeat(this.room.currentTurn);
      const nextPlayer = this.room.players.find(p => p.seat === this.room.currentTurn);
      log.debug(`[advanceGame] 轮到下一玩家: ${prevTurn} -> ${this.room.currentTurn} (${nextPlayer?.username})`);
    }

    this.emitState();
    this.checkAndExecuteBotAction();
  }

  /**
   * 检查是否轮到机器人，如果是则执行机器人决策
   */
  private checkAndExecuteBotAction(): void {
    const currentPlayer = this.room.players.find(p => p.seat === this.room.currentTurn);
    
    if (currentPlayer && currentPlayer.userId.startsWith('bot_') && !currentPlayer.folded && !currentPlayer.allin) {
      log.debug(`[checkAndExecuteBotAction] 轮到机器人 ${currentPlayer.username}，延迟 ${this.botActionDelay}ms 后执行决策`);
      // 机器人决策延迟
      setTimeout(() => {
        this.executeBotAction(currentPlayer.userId);
      }, this.botActionDelay);
    } else {
      if (currentPlayer) {
        log.debug(`[checkAndExecuteBotAction] 当前玩家 ${currentPlayer.username} 是${currentPlayer.userId.startsWith('bot_') ? '机器人' : '真人'}，无需自动执行`);
      } else {
        log.debug(`[checkAndExecuteBotAction] 当前没有玩家 (currentTurn: ${this.room.currentTurn})`);
      }
    }
  }

  /**
   * 执行机器人动作
   */
  private executeBotAction(botId: string): void {
    log.debug(`[executeBotAction] 开始为 ${botId} 执行机器人决策...`);
    const bot = this.bots.get(botId);
    const player = this.getPlayer(botId);
    
    if (!bot || !player || player.folded || player.allin) {
      log.warn(`[executeBotAction] 无法执行机器人动作: bot=${!!bot}, player=${!!player}, folded=${player?.folded}, allin=${player?.allin}`);
      return;
    }

    const currentBet = this.betManager.getCurrentBet();
    const playerBet = player.bet;
    const toCall = currentBet - playerBet;

    log.debug(`[executeBotAction] 机器人 ${player.username} 决策参数: 当前下注=${currentBet}, 玩家下注=${playerBet}, 需跟注=${toCall}`);
    log.debug(`[executeBotAction] 机器人 ${player.username} 手牌: ${bot.hand?.map((c: Card) => `${c.suit}${c.rank}`).join(' ')}`);
    log.debug(`[executeBotAction] 机器人 ${player.username} 公共牌: ${this.room.communityCards.map(c => `${c.suit}${c.rank}`).join(' ')}`);
    log.debug(`[executeBotAction] 机器人 ${player.username} 剩余筹码: ${player.chips}, 风格: ${bot.config.playStyle}`);

    const decision = bot.decide(
      this.room.communityCards,
      this.room.round,
      toCall,
      currentBet,
      this.betManager.getMinRaise(player),
      player.chips
    );

    log.info(`[executeBotAction] 机器人 ${player.username} 决策结果: ${decision.action}${decision.amount ? ` (金额: ${decision.amount})` : ''}`);

    let action: HandAction;
    switch (decision.action) {
      case 'raise':
        action = 'raise';
        break;
      case 'allin':
        action = 'allin';
        break;
      case 'check':
        action = 'check';
        break;
      case 'call':
        action = 'call';
        break;
      default:
        action = 'fold';
    }

    this.clearActionTimer();
    const result = this.processAction(player, action, decision.amount);
    this.emitState();

    if (result.success) {
      log.info(`[executeBotAction] 机器人 ${player.username} 执行 ${action} 成功，当前底池: ${this.room.pot}`);
      this.onEvent('player:actioned', { playerId: botId, action, amount: decision.amount });
      this.advanceGame();
    } else {
      log.warn(`[executeBotAction] 机器人 ${player.username} 执行 ${action} 失败: ${result.error}`);
    }
  }

  private isRoundComplete(): boolean {
    const activePlayers = this.room.players.filter(p => !p.folded && !p.allin);
    // if (activePlayers.length <= 1) {
    //   log.debug(`[isRoundComplete] 活跃玩家 <= 1，返回 true`);
    //   return true;
    // }

    const currentBet = this.betManager.getCurrentBet();
    const allBetsEqual = activePlayers.every(p => p.bet === currentBet && p.hasAct);
    log.debug(`[isRoundComplete] 轮次完成检查结果: ${allBetsEqual}`);
    return allBetsEqual;
  }

  private getNextActiveSeat(from: number): number {
    const activePlayers = this.room.players.filter(p => !p.folded && !p.allin);
    if (activePlayers.length === 0) {
      log.debug(`[getNextActiveSeat] 没有活跃玩家，返回 -1`);
      return -1;
    }
    this.startActionTimer()

    const sortedSeats = activePlayers.map(p => p.seat).sort((a, b) => a - b);
    log.debug(`[getNextActiveSeat] 活跃玩家座位: ${sortedSeats.join(', ')}，从座位 ${from} 找下一个`);
    for (let i = 0; i < sortedSeats.length; i++) {
      if (sortedSeats[i] > from) {
        return sortedSeats[i];
      }
    }
    return sortedSeats[0];
  }

  private showdown(): void {
    log.info('========================================');
    log.info('[showdown] ===== 摊牌阶段开始 =====');
    const activePlayers = this.room.players.filter(p => !p.folded);
    log.debug(`[showdown] 未弃牌玩家数: ${activePlayers.length}`);

    // 找出所有有手牌的玩家并记录他们的下注
    const results: { playerId: string; hand: Card[]; evaluated: ReturnType<typeof evaluateHand> }[] = activePlayers.map(p => {
      const hand = evaluateHand(p.hand ?? [], this.room.communityCards);
      console.log(`[PotDistribution] Evaluated ${p.userId}: hand=${hand.description}, rank=${hand.rank}`);
      return { playerId: p.userId, hand: p.hand ?? [], evaluated: hand };
    });

    // 使用 BetManager 计算底池分配
    const distribution = this.betManager.executePotDistribution( this.room.players, this.room.communityCards);

    // 构建返回结果
    const winners: ShowdownResult['winners'] = [];
    
    for (const pot of distribution.pots) {
      for (const win of pot.winAmounts) {
        const player = activePlayers.find(p => p.userId === win.playerId);
        const result = results.find(r => r.playerId === win.playerId);
        if (player && result) {
          log.info(`[showdown] ${player.username} 赢得底池 ${pot.amount} 中的 ${win.amount}，牌型: ${result.evaluated.description}`);
          winners.push({
            playerId: player.userId,
            username: player.username,
            hand: result.hand,
            evaluatedHand: result.evaluated,
            amount: win.amount,
          });
        }
      }
    }

    this.room.pot = 0;
    this.room.status = 'finished';
    this.room.round = 'finished';

    this.onEvent('game:showdown', {
      roomId: this.room.roomId,
      winners,
      communityCards: this.room.communityCards,
      pots: distribution.pots.map(p => ({
        amount: p.amount,
        winners: p.winners,
      })),
    });

    this.emitState();
  }

  startNextHand(): ActionResult {
    log.debug('[startNextHand] 尝试开始下一局...');
    if (this.room.status !== 'finished') {
      log.warn(`[startNextHand] 当前游戏未结束，无法开始下一局，当前状态: ${this.room.status}`);
      return { success: false, error: '当前游戏未结束' };
    }

    // 移除没有筹码的玩家
    for (const p of this.room.players) {
      if (p.chips < this.room.blindBig) {
        log.debug(`[startNextHand] 移除没有足够筹码的玩家: ${p.username}`);
        this.removePlayer(p.userId);
      }
    }

    // 检查是否还有足够的玩家
    const activePlayers = this.room.players.filter(p => p.chips > 0);
    log.debug(`[startNextHand] 有筹码的玩家数: ${activePlayers.length}`);
    if (activePlayers.length < 2) {
      log.warn(`[startNextHand] 没有足够的玩家继续游戏: ${activePlayers.length} < 2`);
      return { success: false, error: '没有足够的玩家继续游戏' };
    }

    // 移动庄家
    const lastDealerIndex = this.room.players.findIndex(p => p.seat === this.room.dealerSeat);
    const nextDealerIndex = (lastDealerIndex + 1) % this.room.players.length;
    this.room.dealerSeat = this.room.players[nextDealerIndex].seat;
    log.debug(`[startNextHand] 庄家移动: ${lastDealerIndex} -> ${nextDealerIndex}，新庄家座位: ${this.room.dealerSeat}`);

    // 重置游戏状态
    this.room.communityCards = [];
    this.betManager.resetAll(this.room.players);

    for (const p of this.room.players) {
      p.bet = 0;
      p.totalBet = 0;
      p.folded = false;
      p.allin = false;
      p.hand = undefined;
      p.lastAction = undefined;
    }

    // 直接开始下一局
    log.info('[startNextHand] 正在开始下一局...');
    return this.beginHand();
  }

  // ── Action Timer ──────────────────────────────────────────

  private startActionTimer(): void {
    log.debug(`[startActionTimer] 启动行动计时器，超时时间: ${this.actionTimeoutMs}ms`);
    this.clearActionTimer();
    this.actionTimer = setTimeout(() => {
      this.onActionTimeout();
    }, this.actionTimeoutMs);
  }

  private clearActionTimer(): void {
    if (this.actionTimer) {
      log.debug('[clearActionTimer] 清除行动计时器');
      clearTimeout(this.actionTimer);
      this.actionTimer = undefined;
    }
  }

  private onActionTimeout(): void {
    log.debug('[onActionTimeout] 行动超时触发');
    const currentPlayer = this.room.players.find(p => p.seat === this.room.currentTurn);
    if (currentPlayer && !currentPlayer.folded && !currentPlayer.allin) {
      log.info(`[onActionTimeout] 玩家 ${currentPlayer.username} 行动超时，自动弃牌`);
      // 超时自动弃牌
      currentPlayer.folded = true;
      this.emitState();
      this.onEvent('player:actioned', { playerId: currentPlayer.userId, action: 'fold' });
      this.advanceGame();
    } else {
      log.debug(`[onActionTimeout] 无需处理超时，当前玩家: ${currentPlayer?.username || '无'}`);
    }
  }

  // ── Event Emission ───────────────────────────────────────

  private emitState(): void {
    if (DEBUG) {
      const playersSummary = this.room.players.map(p => 
        `${p.username}(seat:${p.seat}, chips:${p.chips}, bet:${p.bet}${p.folded ? ', folded' : ''}${p.allin ? ', allin' : ''})`
      ).join(' | ');
      log.debug(`[emitState] 房间状态更新: roomId=${this.room.roomId}, status=${this.room.status}, round=${this.room.round}, pot=${this.room.pot}, currentTurn=${this.room.currentTurn}, communityCards=[${this.room.communityCards.map(c => `${c.suit}${c.rank}`).join(' ')}]`);
      log.debug(`[emitState] 玩家: ${playersSummary}`);
    }
    this.onEvent('room:state', this.getPublicState());
  }
}
