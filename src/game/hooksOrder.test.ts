// В репозитории нет ESLint с rules-of-hooks, поэтому простая проверка: в главном компоненте приключения
// все хуки стоят до первого раннего return. Хук после «if (playing) return …» роняет экран при начале боя.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('порядок хуков в Adventure', () => {
  it('нет хуков после ранних return', () => {
    const src = readFileSync(join(__dirname, 'Adventure.tsx'), 'utf8');
    const start = src.indexOf('export function Adventure(');
    const end = src.indexOf('\n}\n', start);
    const body = src.slice(start, end);
    const firstReturn = body.indexOf('\n  if (playing)');
    expect(firstReturn).toBeGreaterThan(0);
    const after = body.slice(firstReturn).split('\n');
    const hooks = after.filter((l) => /(^|[^.\w])use(State|Effect|Ref|Memo|Callback|LayoutEffect|CloudReady|Starter|Pro|InClan|ProOffer|Settings)\(/.test(l));
    expect(hooks).toEqual([]);
  });
});
