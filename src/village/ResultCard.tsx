import { type ReactNode, useEffect, useState } from 'react';
import { type Res, RES_KEYS } from '../../shared/village';
import type { BattleResult } from '../../shared/villageBattle';
import { sfx } from '../audio';
import { ResIcon } from './BattleScreen';
import { Star } from './icons';
import { fmtNum } from './state';

// Итог набега как в больших стратегиях: звёзды падают по одной, процент бежит, сундук
// подпрыгивает и открывается, добыча досчитывается до конца.

const STAR_AT = 450;
const STAR_GAP = 420;

/** Число, которое бежит от 0 до to за dur мс, начиная с момента from. */
function countUp(to: number, from: number, dur: number, t: number): number {
  const k = Math.max(0, Math.min(1, (t - from) / dur));
  return Math.round(to * (1 - (1 - k) ** 3));
}

export function ResultCard({ title, result, mode, note, onClose }: { title: string; result: BattleResult; mode: 'attack' | 'replay'; note?: ReactNode; onClose: () => void }) {
  const [t, setT] = useState(0);
  const mine = mode === 'attack';
  const stars = result.stars;
  const hasLoot = RES_KEYS.some((k) => result.loot[k] > 0);
  const chestAt = STAR_AT + Math.max(1, stars) * STAR_GAP + 150;
  const lootAt = chestAt + 450;
  const end = lootAt + 1100;
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const now = performance.now() - t0;
      setT(now);
      if (now < end + 100) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Звук на каждую звезду и на сундук.
    const ids = Array.from({ length: stars }, (_, k) => window.setTimeout(() => sfx('combo'), STAR_AT + k * STAR_GAP));
    if (hasLoot && mine) ids.push(window.setTimeout(() => sfx('chest'), chestAt + 200));
    return () => {
      cancelAnimationFrame(raf);
      ids.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pct = countUp(result.destruction, 200, Math.max(400, STAR_AT + stars * STAR_GAP - 200), t);
  const loot: Res = { wood: 0, stone: 0, gold: 0 };
  for (const k of RES_KEYS) loot[k] = countUp(result.loot[k], lootAt, 1000, t);
  const open = t >= chestAt + 200;
  const good = mine ? stars > 0 : stars === 0;

  return (
    <div className={`result vil-result vr ${good ? 'good' : 'bad'}`}>
      {good && <div className="vr-rays" />}
      <div className="level-tag">{title}</div>
      <div className="result-title vr-title">{stars ? (stars === 3 ? 'Полный разгром!' : 'Победа!') : mode === 'replay' ? 'Набег отбит!' : 'Не вышло'}</div>
      <div className="vr-stars">
        {[0, 1, 2].map((k) => {
          const at = STAR_AT + k * STAR_GAP;
          const on = k < stars && t >= at;
          return (
            <span key={k} className={`vr-star s${k} ${on ? 'on' : ''} ${k < stars ? 'earned' : ''}`}>
              <Star size={k === 1 ? 64 : 52} />
            </span>
          );
        })}
      </div>
      <div className="vr-pct">
        Разрушено <b className="num-outline">{pct}%</b>
        {result.townhall ? ', ратуша пала' : ''}
      </div>
      {hasLoot && (
        <div className={`vr-loot ${t >= chestAt ? 'in' : ''}`}>
          {mine && <Chest open={open} />}
          <div className="vr-loot-list">
            <span className="vr-loot-title">{mode === 'replay' ? 'Унесли' : 'Добыча'}</span>
            {RES_KEYS.filter((k) => result.loot[k] > 0).map((k) => (
              <span key={k} className="vr-loot-cell">
                <ResIcon r={k} size={24} />
                <b className="num-outline">
                  {mine ? '+' : ''}
                  {fmtNum(loot[k])}
                </b>
              </span>
            ))}
          </div>
        </div>
      )}
      {note && <div className={`vil-result-note vr-note ${t >= (hasLoot ? lootAt : chestAt) ? 'in' : ''}`}>{note}</div>}
      <button className={`primary vr-btn ${t >= Math.min(end, 1600) ? 'in' : ''}`} onClick={onClose}>
        В деревню
      </button>
    </div>
  );
}

/** Сундук: подпрыгивает, крышка откидывается, изнутри свет. */
function Chest({ open }: { open: boolean }) {
  return (
    <svg className={`vr-chest ${open ? 'open' : ''}`} width="92" height="84" viewBox="0 0 92 84" aria-hidden="true">
      <defs>
        <linearGradient id="vrWood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c27a3a" />
          <stop offset="1" stopColor="#7c4219" />
        </linearGradient>
        <radialGradient id="vrGlow" cx="0.5" cy="1" r="0.8">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="1" stopColor="#ffcf4a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse className="vr-chest-light" cx="46" cy="40" rx="40" ry="26" fill="url(#vrGlow)" />
      {/* Корпус */}
      <rect x="10" y="40" width="72" height="38" rx="6" fill="url(#vrWood)" stroke="#3b1d08" strokeWidth="4" />
      <rect x="10" y="50" width="72" height="7" fill="#f2b63c" stroke="#3b1d08" strokeWidth="3" />
      <rect x="40" y="46" width="12" height="16" rx="3" fill="#ffd968" stroke="#3b1d08" strokeWidth="3" />
      {/* Крышка */}
      <g className="vr-chest-lid">
        <path d="M10 42 V30 Q46 8 82 30 V42 Z" fill="url(#vrWood)" stroke="#3b1d08" strokeWidth="4" strokeLinejoin="round" />
        <path d="M14 32 Q46 14 78 32" fill="none" stroke="#f2b63c" strokeWidth="5" />
      </g>
    </svg>
  );
}
