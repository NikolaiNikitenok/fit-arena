import { useEffect, useMemo, useRef, useState } from 'react';
import { Res, RES_KEYS } from '../../shared/village';
import { addDeploy, BATTLE_TICKS, BattleArmy, BattleBase, BattleResult, battleResult, createBattle, Deploy, noDeployCells, stepBattle, TPS, TROOPS, UNIT_NAMES, UnitKind, unitsLeft } from '../../shared/villageBattle';
import { sfx } from '../audio';
import { Coin, Cross } from '../icons';
import { RES_COLORS, Star, Stone, Wood } from './icons';
import { fmtNum } from './state';
import type { BattleView, Ctl, ViewBld } from './Village3D';
import { Viewport } from './Viewport';

export const ResIcon = ({ r, size = 15 }: { r: keyof Res; size?: number }) => (
  <span style={{ color: RES_COLORS[r], display: 'inline-flex' }}>{r === 'wood' ? <Wood size={size} /> : r === 'stone' ? <Stone size={size} /> : <Coin size={size} />}</span>
);

export const ResRow = ({ res, plus = false }: { res: Partial<Res>; plus?: boolean }) => (
  <span className="vil-res-row">
    {RES_KEYS.filter((k) => (res[k] ?? 0) > 0).map((k) => (
      <span key={k}>
        <ResIcon r={k} />
        {plus ? '+' : ''}
        {fmtNum(res[k] ?? 0)}
      </span>
    ))}
  </span>
);

interface Props {
  title: string;
  base: BattleBase;
  loot: Res;
  seed: number;
  army: BattleArmy;
  // Набег игрока или повтор набега на его деревню.
  mode: 'attack' | 'replay';
  deploys?: Deploy[];
  enemy: boolean;
  // Бой окончен: что получилось, какие были высадки и когда игрок сдался.
  onFinish?: (r: BattleResult, deploys: Deploy[], endTick?: number) => void;
  onClose: () => void;
}

const ORDER: UnitKind[] = ['hero', 'warrior', 'archer', 'giant', 'wallbreaker', 'healer'];

export function BattleScreen({ title, base, loot, seed, army, mode, deploys, enemy, onFinish, onClose }: Props) {
  // В бою видно всё поле с краем для высадки.
  const ctl = useRef<Ctl>({ tx: 0, tz: 0, zoom: Math.max(11, Math.min(window.innerWidth, window.innerHeight * 0.8) / 25) });
  const view = useRef<BattleView | null>(null);
  if (!view.current) {
    const s = createBattle({ base, army, deploys: mode === 'replay' ? deploys ?? [] : [], loot, seed });
    view.current = { s, prev: new Map(), at: performance.now(), ms: 100, fx: [] };
  }
  const [, setTick] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [unit, setUnit] = useState<UnitKind | null>(() => ORDER.find((u) => (view.current!.s.left[u] ?? 0) > 0) ?? null);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [showZone, setShowZone] = useState(false);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const finished = useRef(false);
  const started = useRef(mode === 'replay');

  const finish = (endTick?: number) => {
    if (finished.current) return;
    finished.current = true;
    const s = view.current!.s;
    s.done = true;
    const r = battleResult(s);
    setResult(r);
    sfx(r.stars > 0 === (mode === 'attack') ? 'win' : 'lose');
    onFinish?.(r, s.input.deploys, endTick);
  };

  useEffect(() => {
    let last = performance.now();
    let acc = 0;
    const id = window.setInterval(() => {
      const now = performance.now();
      const v = view.current!;
      // Бой стоит, пока не высажен первый отряд (как в CoC — можно осмотреться).
      if (!started.current || finished.current) {
        last = now;
        return;
      }
      acc += (now - last) * speedRef.current;
      last = now;
      let stepped = false;
      while (acc >= 100 && !v.s.done) {
        acc -= 100;
        v.prev = new Map(v.s.units.map((u) => [u.n, [u.x, u.y]]));
        stepBattle(v.s, mode === 'attack');
        for (const f of v.s.fx) v.fx.push({ ...f, born: now });
        v.at = now;
        v.ms = 100 / speedRef.current;
        stepped = true;
      }
      if (stepped) setTick(v.s.tick);
      const s = v.s;
      if (s.done) finish(s.input.endTick);
      // Все высаженные погибли, а высаживать некого — конец.
      else if (mode === 'attack' && s.units.length && s.units.every((u) => !u.alive) && !unitsLeft(s)) {
        s.input = { ...s.input, endTick: s.tick };
        finish(s.tick);
      }
    }, 40);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = view.current.s;
  const dead = s.buildings.filter((b) => !b.alive).length;
  const buildings = useMemo<ViewBld[]>(() => s.buildings.map((b) => ({ i: b.i, t: b.t, x: b.x, y: b.y, l: b.l, state: b.alive ? 'ok' : 'ruin' })), [dead, s]);
  const hp: Record<number, number> = {};
  for (const b of s.buildings) if (b.alive && !b.wall && b.hp < b.maxHp) hp[b.i] = b.hp / b.maxHp;
  const zone = useMemo(() => noDeployCells(base), [base]);
  const live = battleResult(s);
  const secLeft = Math.max(0, Math.ceil((BATTLE_TICKS - s.tick) / TPS));

  const tap = (x: number, y: number) => {
    if (mode !== 'attack' || !unit || finished.current) return;
    const d = addDeploy(s, unit, x, y);
    if (!d) {
      setShowZone(true);
      setWarn((s.left[unit] ?? 0) <= 0 ? 'Эти отряды уже в бою.' : 'Слишком близко к постройкам — высаживай в зелёной зоне.');
      setTimeout(() => setWarn(null), 1800);
      return;
    }
    started.current = true;
    sfx('tap');
    if ((s.left[unit] ?? 0) <= 0) setUnit(ORDER.find((u) => (s.left[u] ?? 0) > 0) ?? null);
    setTick((t) => t + 1);
  };

  return (
    <div className="vil-screen battle">
      <Viewport ctl={ctl} buildings={buildings} enemy={enemy} battle={view} hp={hp} noDeploy={showZone || (mode === 'attack' && !started.current) ? zone : undefined} onTap={tap} />
      <div className="vil-top">
        <div className="vil-battle-head">
          <div>
            <div className="level-tag">{mode === 'replay' ? 'Повтор набега' : 'Набег'}</div>
            <b>{title}</b>
          </div>
          <div className="vil-stars">
            {[0, 1, 2].map((k) => (
              <Star key={k} size={20} className={k < live.stars ? 'on' : ''} />
            ))}
          </div>
          <div className="vil-pct">
            {live.destruction}%<small>{Math.floor(secLeft / 60)}:{String(secLeft % 60).padStart(2, '0')}</small>
          </div>
        </div>
        <div className="vil-battle-loot">
          <span className="muted">Добыча:</span> <ResRow res={live.loot} />
          {!RES_KEYS.some((k) => live.loot[k] > 0) && <span className="muted">пока ничего</span>}
        </div>
      </div>
      <div className="vil-side">
        <button className="vil-round" onClick={() => setSpeed(speed === 1 ? 2 : mode === 'replay' && speed === 2 ? 4 : 1)}>
          ×{speed}
        </button>
        {!result && (
          <button className="vil-round danger" onClick={() => (mode === 'attack' && started.current ? (s.input = { ...s.input, endTick: s.tick }, finish(s.tick)) : onClose())} aria-label="Завершить">
            <Cross size={18} />
          </button>
        )}
      </div>
      {warn && <div className="toast vil-warn">{warn}</div>}
      {mode === 'attack' && !result && (
        <div className="vil-bottom">
          {!started.current && <div className="vil-hint">Выбери отряд и коснись земли за красной зоной. Бой начнётся с первой высадки.</div>}
          <div className="vil-troops">
            {ORDER.filter((u) => (u === 'hero' ? army.hero : army.troops[u as keyof typeof TROOPS])).map((u) => (
              <button key={u} className={`vil-troop ${unit === u ? 'active' : ''} ${(s.left[u] ?? 0) <= 0 ? 'empty' : ''}`} onClick={() => setUnit(u)} disabled={(s.left[u] ?? 0) <= 0}>
                <span className={`vil-unit-dot u-${u}`} />
                <span>{UNIT_NAMES[u]}</span>
                <b>×{s.left[u] ?? 0}</b>
              </button>
            ))}
          </div>
        </div>
      )}
      {result && (
        <div className="result vil-result">
          <div className="level-tag">{title}</div>
          <div className="result-title">{result.stars ? (result.stars === 3 ? 'Полный разгром!' : 'Победа!') : mode === 'replay' ? 'Набег отбит!' : 'Не вышло'}</div>
          <div className="vil-stars big">
            {[0, 1, 2].map((k) => (
              <Star key={k} size={40} className={k < result.stars ? 'on' : ''} />
            ))}
          </div>
          <div className="muted light">Разрушено {result.destruction}%{result.townhall ? ', ратуша пала' : ''}</div>
          {RES_KEYS.some((k) => result.loot[k] > 0) && (
            <div className="vil-loot-big">
              {mode === 'replay' ? 'Унесли' : 'Добыча'}: <ResRow res={result.loot} plus={mode !== 'replay'} />
            </div>
          )}
          <button className="primary" onClick={onClose}>
            В деревню
          </button>
        </div>
      )}
    </div>
  );
}
