// Единый аккаунт игрока: Telegram, Max и браузер — разные входы в одного героя.
// Вход — 'tg:123' (дальше добавятся 'max:…' и 'ya:…'). Аккаунт — id, под которым лежат прогресс, клан, кубки, друзья и деревня.
// Старым игрокам Telegram ничего переносить не нужно: их аккаунт и есть их вход, 'tg:123'.
// Новый вход без привязки — тоже сам себе аккаунт. Привязка по коду переводит вход (со всеми входами его аккаунта)
// в другой аккаунт; ненужный герой уходит в архив на ARCHIVE_DAYS дней (только копия прогресса и кубки).
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const CODE_TTL = 10 * 60_000;
export const ARCHIVE_DAYS = 30;
// Без похожих букв и цифр (0/O, 1/I/L), чтобы код легко переписать с другого экрана.
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export type Platform = 'tg' | 'max';
export const LOGIN_RE = /^(tg|max):\d{1,20}$/;
export const platformOf = (login: string): Platform | null => (LOGIN_RE.test(login) ? (login.slice(0, login.indexOf(':')) as Platform) : null);

export interface Archived {
  account: string;
  logins: string[];
  at: number;
  progress: unknown;
  cups: number;
}

interface Data {
  // Вход → аккаунт, только когда они разные (привязанный вход).
  links: Record<string, string>;
  // Аккаунт → последний вход: туда пишет бот.
  last: Record<string, string>;
  // Аккаунт → куда писать, если игрок выбрал сам (иначе — туда, где заходил последним).
  notify?: Record<string, Platform>;
  archive: Archived[];
}

export class AccountStore {
  private links = new Map<string, string>();
  private last = new Map<string, string>();
  private notifyPref = new Map<string, Platform>();
  private archive: Archived[] = [];
  private codes = new Map<string, { account: string; exp: number }>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly file: string | null,
    private readonly now: () => number = Date.now,
  ) {
    if (!file) return;
    try {
      const d = JSON.parse(readFileSync(file, 'utf8')) as Data;
      this.links = new Map(Object.entries(d.links ?? {}));
      this.last = new Map(Object.entries(d.last ?? {}));
      this.notifyPref = new Map(Object.entries(d.notify ?? {}));
      this.archive = d.archive ?? [];
    } catch {
      // Файла ещё нет: все входы сами себе аккаунты.
    }
  }

  /** Аккаунт входа (без отметки «заходил»). */
  resolve(login: string): string {
    return this.links.get(login) ?? login;
  }

  /** Игрок вошёл: аккаунт входа, вход запоминается последним. */
  seen(login: string): string {
    const account = this.resolve(login);
    if (this.last.get(account) !== login) {
      this.last.set(account, login);
      this.save();
    }
    return account;
  }

  /** Все входы аккаунта: свой (если он не переехал в другой аккаунт) и привязанные. */
  logins(account: string): string[] {
    const out = platformOf(account) && !this.links.has(account) ? [account] : [];
    for (const [l, a] of this.links) if (a === account) out.push(l);
    return out;
  }

  /** Вход Telegram, куда писать боту: последний, если это Telegram, иначе любой привязанный. */
  tgLogin(account: string): string | null {
    const last = this.last.get(account);
    const logins = this.logins(account);
    if (last?.startsWith('tg:') && logins.includes(last)) return last;
    return logins.find((l) => l.startsWith('tg:')) ?? null;
  }

  tgChat(account: string): number | null {
    const l = this.tgLogin(account);
    return l ? Number(l.slice(3)) : null;
  }

  /** Куда писать игроку: выбранный мессенджер, иначе где заходил последним, иначе любой привязанный. */
  target(account: string): { platform: Platform; id: number } | null {
    const logins = this.logins(account);
    const pick = (p?: Platform) => (p ? logins.find((l) => platformOf(l) === p) : undefined);
    const last = this.last.get(account);
    const l = pick(this.notifyPref.get(account)) ?? (last && logins.includes(last) ? last : undefined) ?? logins[0];
    if (!l) return null;
    return { platform: platformOf(l)!, id: Number(l.slice(l.indexOf(':') + 1)) };
  }

  notifyChoice(account: string): Platform | null {
    return this.notifyPref.get(account) ?? null;
  }

  /** Выбор в настройках: null — туда, где заходил последним. */
  setNotify(account: string, p: Platform | null): void {
    if (p) this.notifyPref.set(account, p);
    else this.notifyPref.delete(account);
    this.save();
  }

  /** Одноразовый код привязки на CODE_TTL: новый заменяет прежний. */
  code(account: string): { code: string; expiresAt: number } {
    const now = this.now();
    for (const [c, v] of this.codes) if (v.account === account || v.exp <= now) this.codes.delete(c);
    let code = '';
    do code = [...randomBytes(6)].map((b) => CODE_ABC[b % CODE_ABC.length]).join('');
    while (this.codes.has(code));
    const exp = now + CODE_TTL;
    this.codes.set(code, { account, exp });
    return { code, expiresAt: exp };
  }

  /** Чей код (без траты). Неверный или истёкший — null. */
  codeOwner(raw: string): string | null {
    const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const v = this.codes.get(code);
    if (!v || v.exp <= this.now()) return null;
    return v.account;
  }

  /**
   * Свести два аккаунта в один: все входы `from` теперь ведут в `to`, код `raw` погашен.
   * Данные `from` вызывающий архивирует и стирает сам (archiveOf + deletePlayer).
   */
  merge(from: string, to: string, raw?: string): void {
    if (from === to) return;
    for (const l of this.logins(from)) {
      if (l === to) this.links.delete(l);
      else this.links.set(l, to);
    }
    const last = this.last.get(from);
    this.last.delete(from);
    if (last && !this.last.has(to)) this.last.set(to, last);
    this.notifyPref.delete(from);
    if (raw) this.codes.delete(raw.toUpperCase().replace(/[^A-Z0-9]/g, ''));
    for (const [c, v] of this.codes) if (v.account === from) this.codes.delete(c);
    this.save();
  }

  /** Отвязать вход: он начинает своего героя с нуля. Последний вход отвязать нельзя. */
  unlink(account: string, login: string): string | null {
    const logins = this.logins(account);
    if (!logins.includes(login)) return 'Такого входа у аккаунта нет';
    if (logins.length < 2) return 'Это единственный вход: отвязать нельзя';
    // Свой вход аккаунта уходит в новый пустой аккаунт, остальные просто перестают быть привязанными.
    if (login === account) this.links.set(login, `acc:${randomBytes(8).toString('hex')}`);
    else this.links.delete(login);
    if (this.last.get(account) === login) this.last.set(account, logins.find((l) => l !== login)!);
    this.save();
    return null;
  }

  /** Отложить героя, который не выбран при привязке. Старше ARCHIVE_DAYS — забываем. */
  archiveOf(a: Omit<Archived, 'at'>): void {
    const now = this.now();
    this.archive = this.archive.filter((x) => now - x.at < ARCHIVE_DAYS * 86_400_000);
    this.archive.push({ ...a, at: now });
    this.save();
  }

  archived(): Archived[] {
    return this.archive;
  }

  /** «Удалить мои данные»: входы аккаунта становятся пустыми, привязки и архив по ним стираются. */
  forget(account: string): void {
    const logins = this.logins(account);
    for (const l of logins) this.links.delete(l);
    this.last.delete(account);
    this.notifyPref.delete(account);
    this.archive = this.archive.filter((x) => x.account !== account && !x.logins.some((l) => logins.includes(l)));
    for (const [c, v] of this.codes) if (v.account === account) this.codes.delete(c);
    this.save();
  }

  private save(): void {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 500);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const d: Data = { links: Object.fromEntries(this.links), last: Object.fromEntries(this.last), notify: Object.fromEntries(this.notifyPref), archive: this.archive };
    writeFileSync(`${this.file}.tmp`, JSON.stringify(d));
    renameSync(`${this.file}.tmp`, this.file);
  }
}
