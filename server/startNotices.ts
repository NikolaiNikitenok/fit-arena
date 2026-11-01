// Уведомление админам о новом игроке: человек впервые нажал «Старт» в боте — пишем, откуда он пришёл
// (метка из ссылки t.me/<бот>?start=src-МЕТКА, приглашение друга, клан, вызов) и сколько новых за сегодня.
// Новый = бот его раньше не видел и у него нет сохранённого прогресса. Выключается командой /newusers off.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { sourceName } from './statsPage';

/** Источник по параметру /start — те же коды, что в статистике «Откуда пришли». */
export function startSource(param: string): string {
  const p = param.trim();
  if (!p) return 'direct';
  if (p.startsWith('src-')) return p.slice(4).replace(/[^\w-]/g, '').slice(0, 24) || 'direct';
  if (p.startsWith('clan-')) return 'clan';
  if (p.startsWith('friend-')) return 'friend';
  if (p.startsWith('gc-')) return 'group';
  if (/^[A-Z0-9]{4,8}$/i.test(p)) return 'duel';
  return p.replace(/[^\w-]/g, '').slice(0, 24) || 'direct';
}

/** Сутки по Москве: счётчик «новых сегодня» обнуляется в полночь МСК. */
const mskDay = (t: number) => new Date(t + 3 * 3600_000).toISOString().slice(0, 10);

export interface StartFrom {
  id?: number;
  first_name?: string;
  username?: string;
  language_code?: string;
}

export class StartNotices {
  private state = { off: false, seen: {} as Record<string, number>, day: '', bySource: {} as Record<string, number> };
  constructor(
    private file: string | null,
    private d: { known: (tgId: number) => boolean; isAdmin: (tgId: number) => boolean; now?: () => number },
  ) {
    if (file)
      try {
        this.state = { ...this.state, ...JSON.parse(readFileSync(file, 'utf8')) };
      } catch {
        /* первый запуск */
      }
  }

  private save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.state));
    renameSync(`${this.file}.tmp`, this.file);
  }

  /** Личное сообщение боту. Вернёт текст для админов, если это /start нового игрока. */
  onMessage(chatId: number, text: string, from?: StartFrom): string | null {
    const m = /^\/start(?:@\w+)?(?:\s+(\S+))?/.exec(text.trim());
    if (!m || this.d.isAdmin(chatId)) return null;
    const key = String(chatId);
    if (this.state.seen[key]) return null;
    const now = (this.d.now ?? Date.now)();
    this.state.seen[key] = now;
    if (this.d.known(chatId)) return this.save(), null;
    const day = mskDay(now);
    if (this.state.day !== day) this.state = { ...this.state, day, bySource: {} };
    const src = startSource(m[1] ?? '');
    this.state.bySource[src] = (this.state.bySource[src] ?? 0) + 1;
    this.save();
    if (this.state.off) return null;
    const total = Object.values(this.state.bySource).reduce((a, b) => a + b, 0);
    const who = [from?.first_name, from?.username ? `@${from.username}` : '', from?.language_code ? `язык ${from.language_code}` : ''].filter(Boolean).join(', ');
    return (
      `🆕 Новый игрок нажал «Старт»${who ? `: ${who}` : ''}\n` +
      `Источник: ${sourceName(src)}${src !== 'direct' ? ` (метка ${src})` : ''}\n` +
      `Новых сегодня: ${total}, из них с этого источника: ${this.state.bySource[src]}`
    );
  }

  /** /newusers [on|off] от админа — включить, выключить или показать сводку за сегодня. */
  command(text: string): string | null {
    const m = /^\/newusers(?:@\w+)?\s*(on|off|вкл|выкл)?\s*$/i.exec(text.trim());
    if (!m) return null;
    if (m[1]) {
      this.state.off = /^(off|выкл)$/i.test(m[1]);
      this.save();
    }
    const today = this.state.day === mskDay((this.d.now ?? Date.now)()) ? Object.entries(this.state.bySource).sort((a, b) => b[1] - a[1]) : [];
    return (
      `Уведомления о новых игроках ${this.state.off ? 'выключены' : 'включены'} (/newusers ${this.state.off ? 'on' : 'off'} — ${this.state.off ? 'включить' : 'выключить'}).\n` +
      (today.length ? `Сегодня:\n${today.map(([s, n]) => `• ${sourceName(s)}: ${n}`).join('\n')}` : 'Сегодня новых пока нет.')
    );
  }
}
