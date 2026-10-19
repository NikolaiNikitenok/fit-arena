import { Battle, newBattle, Side, strike, winner } from '../shared/battle';
import type { FighterView, PlayerInfo, ServerMessage } from '../shared/protocol';
import type { Exercise } from '../src/repCounter';

export const COUNTDOWN_MS = 3000;
export const ROUND_MS = 60_000;
// Быстрее человек повтор не сделает: так клиент не может «накрутить» удары.
export const MIN_REP_INTERVAL_MS = 400;

export interface Player {
  id: string;
  name: string;
  pro?: boolean;
  send: (msg: ServerMessage) => void;
  // Сервер сообщает соединению, что игрока посадили в комнату (быстрый бой).
  joinedRoom?: (room: Room) => void;
}

interface Seat {
  player: Player;
  side: Side;
  ready: boolean;
  lastRepAt: number;
  lastCombo: boolean;
}

/** Итог рейтингового боя: a и b — id игроков. */
export interface MatchEnd {
  a: string;
  b: string;
  outcome: 'a' | 'b' | 'draw';
}

type Phase = 'lobby' | 'countdown' | 'fight' | 'over';

// Без похожих символов (0/O, 1/I), чтобы код было легко продиктовать.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeCode(random = Math.random): string {
  return Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(random() * CODE_CHARS.length)]).join('');
}

export class Room {
  private seats: Seat[] = [];
  private phase: Phase = 'lobby';
  private battle: Battle = newBattle();
  private startedAt = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(
    readonly code: string,
    readonly exercise: Exercise,
    private readonly now: () => number = Date.now,
    private readonly onEnd?: (end: MatchEnd) => void,
  ) {}

  get empty(): boolean {
    return this.seats.length === 0;
  }

  has(playerId: string): boolean {
    return this.seats.some((s) => s.player.id === playerId);
  }

  join(player: Player): string | null {
    if (this.has(player.id)) return null;
    if (this.seats.length >= 2) return 'В этом бою уже два бойца';
    const side: Side = this.seats.some((s) => s.side === 'player') ? 'bot' : 'player';
    this.seats.push({ player, side, ready: false, lastRepAt: -Infinity, lastCombo: false });
    this.broadcastRoom();
    return null;
  }

  leave(playerId: string): void {
    const seat = this.seats.find((s) => s.player.id === playerId);
    if (!seat) return;
    this.seats = this.seats.filter((s) => s !== seat);
    if (this.phase === 'fight' || this.phase === 'countdown') {
      this.clearTimers();
      this.phase = 'over';
      // Ушёл из боя — проиграл.
      const other = this.seats[0];
      if (other) this.onEnd?.({ a: other.player.id, b: seat.player.id, outcome: 'a' });
      for (const s of this.seats) s.player.send({ type: 'end', result: 'win', reason: 'left' });
    }
    if (this.phase === 'over') this.phase = 'lobby';
    for (const s of this.seats) s.ready = false;
    this.broadcastRoom();
  }

  ready(playerId: string): void {
    const seat = this.seats.find((s) => s.player.id === playerId);
    if (!seat || this.phase === 'countdown' || this.phase === 'fight') return;
    seat.ready = true;
    this.broadcastRoom();
    if (this.seats.length === 2 && this.seats.every((s) => s.ready)) this.startCountdown();
  }

  rep(playerId: string): void {
    const seat = this.seats.find((s) => s.player.id === playerId);
    if (!seat || this.phase !== 'fight') return;
    const t = this.now();
    if (t - seat.lastRepAt < MIN_REP_INTERVAL_MS) return;
    seat.lastRepAt = t;
    const result = strike(this.battle, seat.side, t);
    this.battle = result.battle;
    seat.lastCombo = result.strike.combo;
    this.broadcastState();
    if (winner(this.battle, false)) this.finish('ko');
  }

  dispose(): void {
    this.clearTimers();
  }

  private startCountdown(): void {
    this.phase = 'countdown';
    this.battle = newBattle();
    for (const s of this.seats) {
      s.lastRepAt = -Infinity;
      s.lastCombo = false;
      s.player.send({ type: 'countdown', startsInMs: COUNTDOWN_MS, durationMs: ROUND_MS });
    }
    this.timers.push(
      setTimeout(() => {
        this.phase = 'fight';
        this.startedAt = this.now();
        this.broadcastState();
        this.timers.push(setTimeout(() => this.finish('time'), ROUND_MS));
      }, COUNTDOWN_MS),
    );
  }

  private finish(reason: 'ko' | 'time'): void {
    if (this.phase !== 'fight') return;
    this.clearTimers();
    this.phase = 'over';
    const w = winner(this.battle, true);
    if (this.seats.length === 2) {
      const [a, b] = this.seats;
      this.onEnd?.({ a: a.player.id, b: b.player.id, outcome: w === 'draw' ? 'draw' : w === a.side ? 'a' : 'b' });
    }
    for (const s of this.seats) {
      s.ready = false;
      s.player.send({ type: 'end', result: w === 'draw' ? 'draw' : w === s.side ? 'win' : 'lose', reason });
    }
    this.broadcastRoom();
  }

  private clearTimers(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private view(seat: Seat | undefined, side: Side): FighterView {
    const f = this.battle[side];
    return { name: seat?.player.name ?? '…', pro: seat?.player.pro, hp: f.hp, maxHp: f.maxHp, hits: f.hits, combo: seat?.lastCombo ?? false };
  }

  private broadcastState(): void {
    const leftMs = Math.max(0, ROUND_MS - (this.now() - this.startedAt));
    for (const s of this.seats) {
      const otherSide: Side = s.side === 'player' ? 'bot' : 'player';
      const other = this.seats.find((o) => o.side === otherSide);
      s.player.send({ type: 'state', me: this.view(s, s.side), opponent: this.view(other, otherSide), leftMs });
    }
  }

  private broadcastRoom(): void {
    const players: PlayerInfo[] = this.seats.map((s) => ({ id: s.player.id, name: s.player.name, ready: s.ready, pro: s.player.pro }));
    for (const s of this.seats) s.player.send({ type: 'room', code: this.code, exercise: this.exercise, players });
  }
}
