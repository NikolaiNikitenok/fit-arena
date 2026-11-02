// После победы: «В ленту» одной кнопкой — готовая карточка (уровень, звёзды, повторы), без фото и текста.
// После босса игра сама выкладывает открытку (если автопосты включены), тогда кнопка сразу показывает «Уже в ленте».
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { getSettings } from '../settings';
import { autoPost, canPost } from './autoPost';

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));

export function WinPost({ title, levelNum, reps, starsN, boss }: { title: string; levelNum: number; reps: number; starsN: number; boss?: { name: string; card: () => Promise<Blob> } }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const started = useRef(false);
  const card = { title, value: stars(starsN), sub: `${t('уровень {0}', { 0: levelNum })} · ${reps} ${t('повторов')}` };
  const text = boss ? `Победил босса «${boss.name}» 💥` : `Прошёл «${title}» на ${starsN}★`;
  const send = async (force: boolean) => {
    setState('busy');
    // Открытку босса рисуем чуть позже, чтобы экран победы не дёрнулся.
    const photo = boss ? await boss.card().catch(() => undefined) : undefined;
    const ok = await autoPost(boss ? 'boss' : 'win', text, photo ? null : card, photo, force);
    setState(ok ? 'done' : force ? 'error' : 'idle');
  };
  useEffect(() => {
    if (!boss || started.current || !getSettings().autoPosts || !canPost()) return;
    started.current = true;
    const id = window.setTimeout(() => void send(false), 1500);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!canPost()) return null;
  return (
    <button className="secondary win-post" disabled={state === 'busy' || state === 'done'} onClick={() => void send(true)}>
      {state === 'done' ? t('✓ Уже в ленте') : state === 'busy' ? t('Публикуем…') : state === 'error' ? t('Не вышло — ещё раз') : t('📣 В ленту')}
    </button>
  );
}
