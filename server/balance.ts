// Баланс без релиза: /opt/arena-server/balance.json (BALANCE_FILE). Поля и пределы — в shared/balance.ts.
// Файл перечитывается, когда меняется (проверка не чаще раза в 10 секунд); битый файл не ломает игру —
// остаётся последнее хорошее значение. Игра забирает настройки через GET /api/balance при запуске.
import { readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { type Balance, cleanBalance, DEFAULT_BALANCE } from '../shared/balance';

const CHECK_MS = 10_000;

export class BalanceFile {
  private value: Balance = DEFAULT_BALANCE;
  private mtime = -1;
  private checkedAt = -Infinity;

  constructor(private readonly file: string) {}

  get(now = Date.now()): Balance {
    if (now - this.checkedAt < CHECK_MS) return this.value;
    this.checkedAt = now;
    try {
      const m = statSync(this.file).mtimeMs;
      if (m === this.mtime) return this.value;
      this.mtime = m;
      this.value = cleanBalance(JSON.parse(readFileSync(this.file, 'utf8')));
    } catch (e) {
      // Нет файла — настройки по умолчанию; битый — оставляем прежние и пишем в журнал.
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        this.value = DEFAULT_BALANCE;
        this.mtime = -1;
      } else console.error('balance.json:', e instanceof Error ? e.message : e);
    }
    return this.value;
  }

  /** Поменять одно число (команда админа в боте): пишем весь файл заново, значение зажимаем в пределы. */
  set(key: keyof Balance, value: number): Balance {
    const next = cleanBalance({ ...this.get(Infinity), [key]: value });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2));
    renameSync(tmp, this.file);
    this.checkedAt = -Infinity;
    return (this.value = next);
  }
}

const NAMES: Record<keyof Balance, string> = {
  chargePerRep: 'заряд за повтор',
  dungeonLoot: 'добыча подземелья',
  earlyLoot: 'добыча первых этажей',
  earlyFloors: 'сколько этажей «первые»',
  enemyHp: 'здоровье врагов',
  coins: 'монеты за уровни',
};

/** Текст для админа: текущие настройки и как поменять. */
export function balanceText(b: Balance): string {
  const rows = (Object.keys(NAMES) as (keyof Balance)[]).map((k) => `${k} = ${b[k]}${b[k] === DEFAULT_BALANCE[k] ? '' : ` (обычно ${DEFAULT_BALANCE[k]})`} — ${NAMES[k]}`);
  return `⚖️ Баланс игры\n${rows.join('\n')}\n\nПоменять: /balance enemyHp 0.9\nИгроки получат новое при следующем запуске игры.`;
}

/** /balance — показать, /balance ключ число — поменять. null — не эта команда. */
export function balanceCommand(file: BalanceFile, text: string): string | null {
  const m = /^\/balance(?:@\w+)?(?:\s+(\w+)\s+([\d.,]+))?\s*$/.exec(text.trim());
  if (!m) return null;
  if (!m[1]) return balanceText(file.get());
  if (!(m[1] in NAMES)) return `Нет такой настройки: ${m[1]}. Список: /balance`;
  const v = Number(m[2].replace(',', '.'));
  if (!Number.isFinite(v)) return 'Нужно число, например /balance enemyHp 0.9';
  try {
    return `Готово.\n\n${balanceText(file.set(m[1] as keyof Balance, v))}`;
  } catch (e) {
    return `Не записалось: ${e instanceof Error ? e.message : e}`;
  }
}
