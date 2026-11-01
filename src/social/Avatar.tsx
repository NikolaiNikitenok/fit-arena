// Кружок игрока: фото профиля Telegram (сервер: /api/avatar/<pid>.jpg), а пока оно грузится или его нет —
// первая буква имени на цветном фоне (цвет — от имени, всегда один и тот же). У Pro — золотое кольцо.
import { useState } from 'react';

const HUES = [18, 42, 160, 195, 222, 262, 300, 340];

export const avatarUrl = (pid: string) => `/api/avatar/${pid}.jpg`;

export function Avatar({ name, pro, size = 40, pid, src }: { name: string; pro?: boolean; size?: number; pid?: string; src?: string }) {
  const [state, setState] = useState<'load' | 'ok' | 'none'>('load');
  let h = 0;
  for (const c of name) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  const hue = HUES[h % HUES.length];
  const letter = [...name.trim()][0]?.toUpperCase() ?? '?';
  const url = src ?? (pid ? avatarUrl(pid) : undefined);
  return (
    <span
      className={`avatar ${pro ? 'pro' : ''} ${state === 'ok' ? 'has-photo' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.44, ['--av' as string]: `hsl(${hue} 70% 62%)`, ['--av2' as string]: `hsl(${(hue + 28) % 360} 65% 45%)` }}
      aria-hidden
    >
      {state !== 'ok' && letter}
      {url && state !== 'none' && <img src={url} alt="" loading="lazy" decoding="async" style={state === 'ok' ? undefined : { opacity: 0 }} onLoad={() => setState('ok')} onError={() => setState('none')} />}
    </span>
  );
}
