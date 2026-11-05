// Хранилище Nikitenok ID: аккаунты, привязанные способы входа и сессии браузера (SQLite, node:sqlite).
// Данные приложений (герои, бюджет, привычки) здесь не хранятся — только «кто этот человек».
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Способ входа: 'tg:123' (Telegram), 'ya:456' (Яндекс ID), 'max:789' (Max). */
export const LOGIN_RE = /^(tg|ya|max):\d{1,20}$/;
export const SESSION_DAYS = 180;

export interface Account {
  nid: string;
  name: string;
  created: number;
}
export interface Identity {
  login: string;
  name: string;
  linked: number;
}
export interface Session {
  sid: string;
  nid: string;
  created: number;
  expires: number;
}

const newNid = () => 'nid_' + randomBytes(10).toString('hex');
const hashSid = (sid: string) => createHash('sha256').update(sid).digest('hex');
const cleanName = (s: string) => s.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60);

export class IdStore {
  readonly db: DatabaseSync;
  constructor(
    readonly file: string,
    private readonly now: () => number = Date.now,
  ) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS accounts (nid TEXT PRIMARY KEY, name TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS revocations (nid TEXT PRIMARY KEY, version INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS identities (
        login TEXT PRIMARY KEY, nid TEXT NOT NULL REFERENCES accounts(nid) ON DELETE CASCADE,
        name TEXT NOT NULL, linked INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS identities_nid ON identities(nid);
      CREATE TABLE IF NOT EXISTS sessions (
        sid_hash TEXT PRIMARY KEY, nid TEXT NOT NULL REFERENCES accounts(nid) ON DELETE CASCADE,
        created INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_nid ON sessions(nid);
      CREATE TABLE IF NOT EXISTS log (at INTEGER NOT NULL, nid TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL);
    `);
  }

  account(nid: string): Account | null {
    return (this.db.prepare('SELECT nid, name, created FROM accounts WHERE nid = ?').get(nid) as Account | undefined) ?? null;
  }

  identities(nid: string): Identity[] {
    return this.db.prepare('SELECT login, name, linked FROM identities WHERE nid = ? ORDER BY linked').all(nid) as unknown as Identity[];
  }

  /** Аккаунт, к которому привязан этот способ входа. */
  resolve(login: string): string | null {
    const r = this.db.prepare('SELECT nid FROM identities WHERE login = ?').get(login) as { nid: string } | undefined;
    return r?.nid ?? null;
  }

  /** Вход: находит аккаунт по способу входа или заводит новый. */
  signIn(login: string, name: string): { nid: string; created: boolean } {
    if (!LOGIN_RE.test(login)) throw new Error('bad login');
    const found = this.resolve(login);
    if (found) {
      this.db.prepare('UPDATE identities SET name = ? WHERE login = ?').run(cleanName(name), login);
      return { nid: found, created: false };
    }
    const nid = newNid();
    const at = this.now();
    this.tx(() => {
      this.db.prepare('INSERT INTO accounts (nid, name, created) VALUES (?, ?, ?)').run(nid, cleanName(name) || 'Без имени', at);
      this.db.prepare('INSERT INTO identities (login, nid, name, linked) VALUES (?, ?, ?, ?)').run(login, nid, cleanName(name), at);
      this.logEvent(nid, 'created', login);
    });
    return { nid, created: true };
  }

  /** Привязать ещё один способ входа к аккаунту. Чужой способ входа не перехватываем. */
  link(nid: string, login: string, name: string): 'linked' | 'already' | 'taken' {
    if (!LOGIN_RE.test(login)) throw new Error('bad login');
    const owner = this.resolve(login);
    if (owner === nid) return 'already';
    if (owner) return 'taken';
    this.db.prepare('INSERT INTO identities (login, nid, name, linked) VALUES (?, ?, ?, ?)').run(login, nid, cleanName(name), this.now());
    this.logEvent(nid, 'linked', login);
    return 'linked';
  }

  /** Отвязать способ входа. Последний не отвязываем, иначе в аккаунт будет не войти. */
  unlink(nid: string, login: string): 'unlinked' | 'last' | 'missing' {
    const list = this.identities(nid);
    if (!list.some((i) => i.login === login)) return 'missing';
    if (list.length <= 1) return 'last';
    this.db.prepare('DELETE FROM identities WHERE login = ? AND nid = ?').run(login, nid);
    this.logEvent(nid, 'unlinked', login);
    return 'unlinked';
  }

  rename(nid: string, name: string): void {
    const n = cleanName(name);
    if (n) this.db.prepare('UPDATE accounts SET name = ? WHERE nid = ?').run(n, nid);
  }

  /** Удалить аккаунт со всеми привязками и сессиями. */
  remove(nid: string): void {
    this.tx(() => {
      this.revoke(nid);
      this.db.prepare('DELETE FROM accounts WHERE nid = ?').run(nid);
      this.logEvent(nid, 'deleted', '');
    });
  }

  newSession(nid: string): string {
    const sid = randomBytes(24).toString('base64url');
    const at = this.now();
    this.db.prepare('INSERT INTO sessions (sid_hash, nid, created, expires) VALUES (?, ?, ?, ?)').run(hashSid(sid), nid, at, at + SESSION_DAYS * 86_400_000);
    return sid;
  }

  session(sid: string): Session | null {
    if (!sid || sid.length > 100) return null;
    const r = this.db.prepare('SELECT nid, created, expires FROM sessions WHERE sid_hash = ?').get(hashSid(sid)) as Omit<Session, 'sid'> | undefined;
    if (!r || r.expires < this.now()) return null;
    return { sid, ...r };
  }

  endSession(sid: string): void {
    this.db.prepare('DELETE FROM sessions WHERE sid_hash = ?').run(hashSid(sid));
  }

  /** Выйти на всех устройствах. */
  endAllSessions(nid: string): number {
    this.revoke(nid);
    return Number(this.db.prepare('DELETE FROM sessions WHERE nid = ?').run(nid).changes);
  }

  version(nid: string): number {
    return Number((this.db.prepare('SELECT version FROM revocations WHERE nid = ?').get(nid) as { version: number } | undefined)?.version ?? 0);
  }
  revocations(): Record<string, number> {
    return Object.fromEntries((this.db.prepare('SELECT nid, version FROM revocations').all() as { nid: string; version: number }[]).map((r) => [r.nid, r.version]));
  }
  private revoke(nid: string): void {
    this.db.prepare('INSERT INTO revocations VALUES (?, 1) ON CONFLICT(nid) DO UPDATE SET version = version + 1').run(nid);
  }

  sessionCount(nid: string): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE nid = ? AND expires > ?').get(nid, this.now()) as { n: number }).n);
  }

  stats(): { accounts: number; identities: number } {
    const a = this.db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number };
    const i = this.db.prepare('SELECT COUNT(*) AS n FROM identities').get() as { n: number };
    return { accounts: Number(a.n), identities: Number(i.n) };
  }

  /** Убрать истёкшие сессии и старый журнал. */
  cleanup(): void {
    const now = this.now();
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(now);
    this.db.prepare('DELETE FROM log WHERE at < ?').run(now - 365 * 86_400_000);
  }

  /** Копия базы в папку dir (одна на день), хранится keep последних. */
  backup(dir: string, keep = 14): string {
    mkdirSync(dir, { recursive: true });
    const day = new Date(this.now()).toISOString().slice(0, 10);
    const file = join(dir, `id-${day}.db`);
    rmSync(file, { force: true });
    this.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const old = readdirSync(dir).filter((f) => /^id-\d{4}-\d\d-\d\d\.db$/.test(f)).sort().slice(0, -keep);
    for (const f of old) rmSync(join(dir, f), { force: true });
    return file;
  }

  private logEvent(nid: string, event: string, detail: string): void {
    this.db.prepare('INSERT INTO log (at, nid, event, detail) VALUES (?, ?, ?, ?)').run(this.now(), nid, event, detail);
  }

  private tx(fn: () => void): void {
    this.db.exec('BEGIN');
    try {
      fn();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}
