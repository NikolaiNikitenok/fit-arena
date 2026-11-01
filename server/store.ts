// Профили игроков дуэлей. Храним в JSON-файле: игроков немного, база данных пока не нужна.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { cupsChange, seasonAt } from '../shared/rating';

export interface Profile {
  id: string;
  name: string;
  cups: number;
  wins: number;
  losses: number;
  draws: number;
  season: number;
}

export class Store {
  private profiles = new Map<string, Profile>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly file: string | null,
    private readonly now: () => number = Date.now,
  ) {
    if (!file) return;
    try {
      for (const p of JSON.parse(readFileSync(file, 'utf8')) as Profile[]) this.profiles.set(p.id, p);
    } catch {
      // Файла ещё нет — начинаем с пустой таблицы.
    }
  }

  /** Кубки гостя переходят в аккаунт Telegram, если там ещё не было боёв. */
  adopt(id: string, guestId: string): void {
    const g = this.profiles.get(guestId);
    const t = this.profiles.get(id);
    if (!g || (t && t.wins + t.losses + t.draws > 0)) return;
    this.profiles.set(id, { ...g, id });
    this.profiles.delete(guestId);
    this.scheduleSave();
  }

    /** Имя из профиля дуэлей (без создания профиля). */
    nameOf(id: string): string | undefined {
      return this.profiles.get(id)?.name;
    }

    /** Играл ли дуэли (без создания профиля). */
    played(id: string): boolean {
      const p = this.profiles.get(id);
      return !!p && p.wins + p.losses + (p.draws ?? 0) > 0;
    }

    get(id: string, name: string): Profile {
    const season = seasonAt(this.now());
    let p = this.profiles.get(id);
    if (!p) {
      p = { id, name, cups: 0, wins: 0, losses: 0, draws: 0, season };
      this.profiles.set(id, p);
    }
    if (p.season !== season) {
      p.cups = Math.floor(p.cups / 2);
      p.season = season;
    }
    p.name = name;
    this.scheduleSave();
    return p;
  }

  /** Кубки игрока без создания профиля (для списка друзей). Новый сезон — половина. */
  cupsOf(id: string): number {
    const p = this.profiles.get(id);
    if (!p) return 0;
    return p.season === seasonAt(this.now()) ? p.cups : Math.floor(p.cups / 2);
  }

  /** Записывает исход боя и возвращает изменение кубков каждого. */
  result(a: Profile, b: Profile, outcome: 'a' | 'b' | 'draw'): { a: number; b: number } {
    if (outcome === 'draw') {
      a.draws++;
      b.draws++;
      this.scheduleSave();
      return { a: 0, b: 0 };
    }
    const [w, l] = outcome === 'a' ? [a, b] : [b, a];
    const { win, loss } = cupsChange(w.cups, l.cups);
    w.cups += win;
    l.cups -= loss;
    w.wins++;
    l.losses++;
    this.scheduleSave();
    return outcome === 'a' ? { a: win, b: -loss } : { a: -loss, b: win };
  }

  top(limit: number): Profile[] {
    const season = seasonAt(this.now());
    return [...this.profiles.values()]
      .filter((p) => p.season === season && p.wins + p.losses + p.draws > 0)
      .sort((x, y) => y.cups - x.cups || y.wins - x.wins)
      .slice(0, limit);
  }

  rank(id: string): number | null {
    const i = this.top(Infinity).findIndex((p) => p.id === id);
    return i < 0 ? null : i + 1;
  }

  /** Герой вернулся из архива: кубки на место (бои с ним не сохранились). */
  restoreCups(id: string, cups: number): void {
    if (!cups) return;
    const p = this.get(id, this.profiles.get(id)?.name ?? 'Игрок');
    p.cups = cups;
    this.scheduleSave();
  }

  /** Игрок попросил удалить свои данные: профиль и кубки пропадают. */
  forget(id: string): void {
    if (this.profiles.delete(id)) this.scheduleSave();
  }

  /** Сохраняет сразу, если есть несохранённые изменения (перед остановкой сервера). */
  flush(): void {
    if (!this.file || !this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify([...this.profiles.values()]));
    renameSync(`${this.file}.tmp`, this.file);
  }

  private scheduleSave(): void {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), 1000);
  }
}
