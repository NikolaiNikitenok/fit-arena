// Вкладка «Уровни» в стиле «Спорт»: вместо 3D-карты мира — строгий список подходов с целью и звёздами.
import { useEffect, useRef, useState } from 'react';
import { EXERCISE_LABELS } from '../repCounter';
import { LEVELS, targetReps, type LevelDef } from '../game/levels';
import { isUnlocked, type Progress } from '../game/progress';
import { Check, Lock } from '../icons';
import { t } from '../i18n';
import { SPORT_NAMES } from './names';
import './sport.css';

const BLOCKS = [
  { from: 1, to: 100 },
  { from: 101, to: 200 },
  { from: 201, to: LEVELS.length },
];

export function SportLevels({ progress, currentId, lives, onPlay }: { progress: Progress; currentId: number; lives: React.ReactNode; onPlay: (l: LevelDef) => void }) {
  const [block, setBlock] = useState(() => Math.max(0, BLOCKS.findIndex((b) => currentId >= b.from && currentId <= b.to)));
  const cur = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cur.current?.scrollIntoView({ block: 'center' });
  }, [block]);
  const b = BLOCKS[block];
  const list = LEVELS.filter((l) => l.id >= b.from && l.id <= b.to);
  return (
    <div className="sp-home sp-levels">
      <header className="sp-home-head">
        <div>
          <small>{t('Пройдено {0} из {1}', { 0: Object.keys(progress.stars).length, 1: LEVELS.length })}</small>
          <h1>{t('Уровни')}</h1>
        </div>
        <div className="sp-home-tools">{lives}</div>
      </header>
      <div className="style-switch">
        {BLOCKS.map((x, i) => (
          <button key={i} className={i === block ? 'on' : ''} disabled={!isUnlocked(progress, x.from)} onClick={() => setBlock(i)}>
            {`${x.from}–${x.to}`}
          </button>
        ))}
      </div>
      <div className="sp-list">
        {list.map((l) => {
          const open = isUnlocked(progress, l.id);
          const stars = progress.stars[l.id] ?? 0;
          const now = l.id === currentId;
          return (
            <button key={l.id} ref={now ? cur : undefined} className={`sp-row sp-lvl ${now ? 'now' : ''} ${open ? '' : 'locked'}`} disabled={!open} onClick={() => onPlay(l)}>
              <span className="sp-lvl-num">{l.id}</span>
              <span className="sp-row-text">
                <b>{SPORT_NAMES[l.type]}</b>
                <small>
                  {l.exercises.map((e) => t(EXERCISE_LABELS[e]).toLowerCase()).join(' → ')}
                  {l.type !== 'trial' && ` · ${t('цель {0}', { 0: targetReps(l, progress.baseline) })}`}
                </small>
              </span>
              <span className="sp-lvl-end">
                {!open ? <Lock size={16} /> : stars ? <span className="sp-lvl-stars">{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</span> : now ? <span className="sp-lvl-go">{t('Старт')}</span> : null}
                {stars === 3 && <Check size={14} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
