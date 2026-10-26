import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { GRID, Res, RES_KEYS } from '../../shared/village';
import { addDeploy, BATTLE_TICKS, BattleArmy, BattleBase, BattleResult, battleResult, createBattle, Deploy, heroUnit, noDeployCells, stepBattle, TPS, TROOPS, UNIT_NAMES, UnitKind, unitsLeft } from '../../shared/villageBattle';
import { sfx } from '../audio';
import { BattleSounds } from '../gameSounds';
import { Cross, Lock } from '../icons';
import { ChunkyRes, RES_COLORS, SkillIcon, Star } from './icons';
import { nextSkill, SKILLS, skillsFor, type SkillId } from '../../shared/heroSkills';
import { fmtNum } from './state';
import { animateTo, type BattleView, type Ctl, type ViewBld } from './Village3D';
import { useHostedView } from './Viewport';
import { DEFAULT_HERO, type HeroLook } from './troops3d';
import { HeroThumb, TroopThumb } from './TroopInfo';
import { ResultCard } from './ResultCard';

export const ResIcon = ({ r, size = 15 }: { r: keyof Res; size?: number }) => (
  <span style={{ color: RES_COLORS[r], display: 'inline-flex' }}>
    <ChunkyRes r={r} size={Math.round(size * 1.12)} />
  </span>
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
  // Повтор: нападающий сдался на этом тике.
  endTick?: number;
  enemy: boolean;
  // Строка под названием (кубки за набег), строка на итоговой карточке (что сказал сервер).
  note?: ReactNode;
  resultNote?: ReactNode;
  // Сколько секунд можно осматриваться: потом бой начнётся сам (набег на игрока — цель забронирована).
  scout?: number;
  // «Следующий»: пропустить соперника до первой высадки; skipBusy — новый соперник уже ищется.
  onSkip?: () => void;
  skipBusy?: boolean;
  // Бой окончен: что получилось, какие были высадки и когда игрок сдался.
  onFinish?: (r: BattleResult, deploys: Deploy[], endTick?: number) => void;
  onClose: () => void;
  // Как выглядит герой нападающего (у своего набега — твоё снаряжение).
  heroLook?: HeroLook;
}

const ORDER: UnitKind[] = ['hero', 'warrior', 'archer', 'giant', 'wallbreaker', 'healer'];

export function BattleScreen({ title, base, loot, seed, army, mode, deploys, endTick, enemy, note, resultNote, scout, onSkip, skipBusy, onFinish, onClose, heroLook }: Props) {
  // В бою видно всё поле с краем для высадки.
  const ctl = useRef<Ctl>({ tx: 0, tz: 0, zoom: Math.max(11, Math.min(window.innerWidth, window.innerHeight * 0.8) / 25) });
  const view = useRef<BattleView | null>(null);
  if (!view.current) {
    const s = createBattle({ base, army, deploys: mode === 'replay' ? deploys ?? [] : [], loot, seed, endTick: mode === 'replay' ? endTick : undefined });
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
  const scoutEnd = useRef(scout ? performance.now() + scout * 1000 : 0);
  const scoutSec = useRef(0);
  const sounds = useRef<BattleSounds | null>(null);
  sounds.current ??= new BattleSounds(view.current.s);

  const slowUntil = useRef(0);
  const [thFell, setThFell] = useState(false);
  // Ратуша пала: замедление, камера наезжает и вздрагивает, надпись на весь экран.
  const townhallDown = (x: number, y: number) => {
    slowUntil.current = performance.now() + 1600;
    const c = ctl.current;
    const back = { tx: c.tx, tz: c.tz, zoom: c.zoom };
    animateTo(c, { tx: x - GRID / 2, tz: y - GRID / 2, zoom: c.zoom * 1.25 }, 600);
    c.shake = { amp: 0.35, t: 0 };
    sfx('roar');
    setThFell(true);
    window.setTimeout(() => {
      setThFell(false);
      animateTo(ctl.current, back, 700);
    }, 1700);
  };

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
      // Бой стоит, пока не высажен первый отряд (как в CoC — можно осмотреться, но у набега на игрока — недолго).
      if (!started.current && scoutEnd.current && now >= scoutEnd.current) started.current = true;
      if (!started.current || finished.current) {
        // Обратный отсчёт осмотра: перерисовка раз в секунду.
        const sec = Math.ceil((scoutEnd.current - now) / 1000);
        if (scoutEnd.current && !started.current && sec !== scoutSec.current) {
          scoutSec.current = sec;
          setTick(-sec);
        }
        last = now;
        return;
      }
      // Ратуша рушится в замедленной съёмке: полторы секунды бой идёт вчетверо медленнее.
      const slow = now < slowUntil.current ? 0.25 + 0.75 * Math.max(0, 1 - (slowUntil.current - now) / 1600) ** 3 : 1;
      acc += (now - last) * speedRef.current * slow;
      last = now;
      let stepped = false;
      while (acc >= 100 && !v.s.done) {
        acc -= 100;
        const thAlive = v.s.buildings.some((b) => b.t === 'townhall' && b.alive);
        v.prev = new Map(v.s.units.map((u) => [u.n, [u.x, u.y]]));
        if (v.s.keeper) v.prev.set(v.s.keeper.n, [v.s.keeper.x, v.s.keeper.y]);
        stepBattle(v.s, mode === 'attack');
        sounds.current!.collect(v.s);
        for (const f of v.s.fx) v.fx.push({ ...f, born: now });
        v.at = now;
        v.ms = 100 / (speedRef.current * slow);
        stepped = true;
        const th = v.s.buildings.find((b) => b.t === 'townhall');
        if (thAlive && th && !th.alive) townhallDown(th.x + th.size / 2, th.y + th.size / 2);
      }
      if (stepped) {
        sounds.current!.play();
        setTick(v.s.tick);
      }
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
  const sprung = s.traps.filter((t) => t.fired >= 0).length;
  // Ловушки у чужой деревни не видны, пока не сработают; в повторе набега на тебя видны все свои.
  const buildings = useMemo<ViewBld[]>(
    () => [
      ...s.buildings.map((b): ViewBld => ({ i: b.i, t: b.t, x: b.x, y: b.y, l: b.l, state: b.alive ? 'ok' : 'ruin' })),
      ...s.traps.filter((t) => !enemy || t.fired >= 0).map((t): ViewBld => ({ i: t.i, t: t.t, x: t.x, y: t.y, l: t.l, state: t.fired >= 0 ? 'ruin' : 'ok' })),
    ],
    [dead, sprung, s, enemy],
  );
  const hp: Record<number, number> = {};
  for (const b of s.buildings) if (b.alive && !b.wall && b.hp < b.maxHp) hp[b.i] = b.hp / b.maxHp;
  const zone = useMemo(() => noDeployCells(base), [base]);
  const live = battleResult(s);
  const secLeft = Math.max(0, Math.ceil((BATTLE_TICKS - s.tick) / TPS));
  const scouting = mode === 'attack' && !started.current && !!scoutEnd.current;
  const scoutLeft = scouting ? Math.max(0, Math.ceil((scoutEnd.current - performance.now()) / 1000)) : 0;

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

  // Умение героя: срабатывает сразу вокруг героя, один раз за бой.
  const cast = (a: SkillId) => {
    if (mode !== 'attack' || finished.current) return;
    if (!addDeploy(s, a, 0, 0)) {
      setWarn(heroUnit(s) ? 'Это умение уже было.' : 'Сначала высади героя — умение срабатывает вокруг него.');
      setTimeout(() => setWarn(null), 1800);
      return;
    }
    started.current = true;
    setTick((t) => t + 1);
  };
  const skills = skillsFor(army.hero);
  const locked = army.hero ? nextSkill(army.hero) : undefined;
  const hero = heroUnit(s);

  const viewport = useHostedView({ ctl, buildings, enemy, battle: view, hp, heroLook, foe: mode === 'replay', noDeploy: showZone || (mode === 'attack' && !started.current) ? zone : undefined, onTap: tap });

  return (
    <div className="vil-battle-ui">
      {viewport}
      <div className="vil-top">
        <div className="vil-battle-head">
          <div>
            <div className="level-tag">{mode === 'replay' ? 'Повтор набега' : 'Набег'}</div>
            <b>{title}</b>
            {note && <div className="vil-battle-note">{note}</div>}
          </div>
          <div className="vil-stars">
            {[0, 1, 2].map((k) => (
              <Star key={k} size={20} className={k < live.stars ? 'on' : ''} />
            ))}
          </div>
          <div className="vil-pct">
            {live.destruction}%<small>{scouting ? `осмотр ${scoutLeft} с` : `${Math.floor(secLeft / 60)}:${String(secLeft % 60).padStart(2, '0')}`}</small>
          </div>
        </div>
        {/* Сколько всего можно унести и сколько уже взято: полоска заполняется по ходу боя. */}
        <div className="vil-loot-panel">
          <span className="vil-loot-title">{mode === 'replay' ? 'Могли унести' : started.current ? 'Добыча' : 'Можно унести'}</span>
          {RES_KEYS.some((k) => loot[k] > 0) ? (
            RES_KEYS.filter((k) => loot[k] > 0).map((k) => (
              <span key={k} className="vil-loot-cell" style={{ '--c': RES_COLORS[k] } as React.CSSProperties}>
                <ResIcon r={k} size={20} />
                <span className="vil-loot-num">
                  <b>{fmtNum(loot[k])}</b>
                  <i className="vil-loot-bar">
                    <i style={{ width: `${Math.min(100, (100 * live.loot[k]) / loot[k])}%` }} />
                  </i>
                  {started.current || mode === 'replay' ? <small>+{fmtNum(live.loot[k])}</small> : null}
                </span>
              </span>
            ))
          ) : (
            <span className="muted">добычи нет</span>
          )}
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
      {thFell && <div className="vil-thfell">Ратуша пала!</div>}
      {mode === 'attack' && !result && (
        <div className="vil-bottom">
          {!started.current && <div className="vil-hint">Выбери отряд и коснись земли за красной зоной. Бой начнётся с первой высадки{scouting ? ` или через ${scoutLeft} с` : ''}.</div>}
          {!started.current && onSkip && (
            <button className="vil-next" onClick={onSkip} disabled={skipBusy}>
              <span>
                <b>{skipBusy ? 'Ищем другую деревню…' : 'Следующая деревня'}</b>
                <small>Не нравится добыча — поищи другую</small>
              </span>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            </button>
          )}
          <div className="vil-troops">
            {ORDER.filter((u) => (u === 'hero' ? army.hero : army.troops[u as keyof typeof TROOPS])).map((u) => (
              <button key={u} className={`vil-troop ${unit === u ? 'active' : ''} ${(s.left[u] ?? 0) <= 0 ? 'empty' : ''}`} onClick={() => setUnit(u)} disabled={(s.left[u] ?? 0) <= 0} aria-label={`${UNIT_NAMES[u]}: ${s.left[u] ?? 0}`}>
                <span className={`vil-troop-face u-${u}`}>{u === 'hero' ? <HeroThumb look={heroLook ?? DEFAULT_HERO} size={52} /> : <TroopThumb id={u} size={52} level={army.lv?.[u]} still />}</span>
                <b className="vil-troop-n">×{s.left[u] ?? 0}</b>
                {u !== 'hero' && (army.lv?.[u] ?? 1) > 1 && <span className="vil-troop-lv">{army.lv?.[u]}</span>}
                <span className="vil-troop-name">{UNIT_NAMES[u]}</span>
              </button>
            ))}
          </div>
          {(skills.length > 0 || locked) && (
            <div className="vil-skills">
              {skills.map((a) => {
                const ready = (s.left[a] ?? 0) > 0;
                return (
                  <button key={a} className={`vil-skill ${ready && hero ? 'ready' : ''} ${ready ? '' : 'used'}`} style={{ color: SKILLS[a].color }} onClick={() => cast(a)} disabled={!ready} aria-label={`${SKILLS[a].name}: ${SKILLS[a].desc}`}>
                    <SkillIcon id={a} size={24} />
                    <span>{SKILLS[a].name}</span>
                  </button>
                );
              })}
              {locked && (
                <div className="vil-skill locked" title={locked.desc}>
                  <Lock size={18} />
                  <span>
                    {locked.name} · ур. {locked.level}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {result && <ResultCard title={title} result={result} mode={mode} note={resultNote} onClose={onClose} />}
    </div>
  );
}
