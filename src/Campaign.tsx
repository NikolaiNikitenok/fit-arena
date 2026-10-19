import { useRef, useState } from 'react';
import { ArenaStage } from './ArenaStage';
import { Battle, newBattle, Side, strike, winner } from '../shared/battle';
import { isUnlocked, Level, LEVELS, loadProgress, saveStars, starsFor, ZONES } from './campaign';
import { EXERCISE_LABELS } from './repCounter';
import { userName } from './telegram';
import { useRepCamera } from './useRepCamera';

type Status = 'ready' | 'loading' | 'running' | 'won' | 'lost' | 'error';

const Stars = ({ n }: { n: number }) => (
  <span className="stars">
    {[1, 2, 3].map((i) => (
      <span key={i} className={i <= n ? 'on' : ''}>
        ★
      </span>
    ))}
  </span>
);

export function Campaign() {
  const [progress, setProgress] = useState(loadProgress);
  const [level, setLevel] = useState<Level | null>(null);

  if (level)
    return (
      <LevelFight
        key={level.id}
        level={level}
        onExit={() => setLevel(null)}
        onWin={(stars) => setProgress((p) => saveStars(p, level.id, stars))}
        onNext={() => setLevel(LEVELS.find((l) => l.id === level.id + 1) ?? null)}
      />
    );

  return (
    <div className="map">
      {ZONES.map((zone, z) => (
        <div key={zone.name} className="zone" style={{ background: `linear-gradient(135deg, ${zone.ring}, ${zone.background})` }}>
          <div className="zone-name">
            Мир {z + 1}. {zone.name}
          </div>
          <div className="zone-levels">
            {LEVELS.filter((l) => l.zone === z).map((l) => {
              const open = isUnlocked(progress, l.id);
              return (
                <button key={l.id} className={`node ${l.boss ? 'boss' : ''}`} disabled={!open} onClick={() => setLevel(l)}>
                  <span className="node-num">{open ? (l.boss ? 'БОСС' : l.id) : '🔒'}</span>
                  <Stars n={progress[l.id] ?? 0} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function LevelFight({ level, onExit, onWin, onNext }: { level: Level; onExit: () => void; onWin: (stars: number) => void; onNext: () => void }) {
  const camera = useRepCamera();
  const setup = () => newBattle({ bot: { hp: level.hp, power: level.power } });
  const [status, setStatus] = useState<Status>('ready');
  const [battle, setBattle] = useState<Battle>(setup);
  const [combo, setCombo] = useState<Record<Side, boolean>>({ player: false, bot: false });
  const [seconds, setSeconds] = useState(level.seconds);
  const [stars, setStars] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const battleRef = useRef(battle);
  const botTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const over = useRef(false);

  const enraged = !!level.boss && battle.bot.hp > 0 && battle.bot.hp / battle.bot.maxHp <= level.boss.enrageAt;

  // Бой кончается нокаутом или по времени; сдаться — всегда поражение.
  const finish = (surrender = false) => {
    if (over.current) return;
    over.current = true;
    clearTimeout(botTimer.current);
    camera.stop();
    const w = surrender ? 'bot' : winner(battleRef.current, true);
    if (w === 'player') {
      const s = starsFor(battleRef.current.player.hp, battleRef.current.player.maxHp);
      setStars(s);
      onWin(s);
      setStatus('won');
    } else {
      setStatus('lost');
    }
  };

  const hit = (side: Side) => {
    if (over.current) return;
    const before = battleRef.current;
    const r = strike(before, side, performance.now());
    battleRef.current = r.battle;
    setBattle(r.battle);
    setCombo((c) => ({ ...c, [side]: r.strike.combo }));
    const boss = level.boss;
    if (boss && before.bot.hp / before.bot.maxHp > boss.enrageAt && r.battle.bot.hp / r.battle.bot.maxHp <= boss.enrageAt && r.battle.bot.hp > 0)
      setBanner(boss.taunt);
    if (winner(r.battle, false)) finish();
  };

  const start = async () => {
    setError(null);
    setBanner(null);
    setStatus('loading');
    const fresh = setup();
    battleRef.current = fresh;
    setBattle(fresh);
    setCombo({ player: false, bot: false });
    over.current = false;
    try {
      // Время считаем по часам, а не по таймеру: на слабых телефонах таймеры отстают.
      let endAt = 0;
      await camera.start(
        level.exercise,
        () => hit('player'),
        () => {
          endAt ||= performance.now() + level.seconds * 1000;
          const left = Math.max(0, Math.ceil((endAt - performance.now()) / 1000));
          setSeconds(left);
          if (left === 0) finish();
          return !over.current;
        },
      );
      const scheduleBot = () => {
        const b = battleRef.current.bot;
        const rage = level.boss && b.hp / b.maxHp <= level.boss.enrageAt ? level.boss.enrageSpeedup : 1;
        const delay = (level.intervalMs + (Math.random() * 2 - 1) * level.jitterMs) * rage;
        botTimer.current = setTimeout(() => {
          hit('bot');
          if (!over.current) scheduleBot();
        }, delay);
      };
      scheduleBot();
      setStatus('running');
    } catch (e) {
      over.current = true;
      camera.stop();
      setError(e instanceof Error ? e.message : 'не загрузилась модель распознавания');
      setStatus('error');
    }
  };

  const zone = ZONES[level.zone];
  const hasNext = LEVELS.some((l) => l.id === level.id + 1);
  const busy = status === 'loading' || status === 'running';

  let overlay = null;
  if (status === 'ready')
    overlay = (
      <>
        <div className="level-tag">{level.boss ? `Босс мира ${level.zone + 1}` : `Уровень ${level.id}`}</div>
        <div className="result-title small">{level.name}</div>
        <div className="muted">
          {EXERCISE_LABELS[level.exercise]} · {level.seconds} с · здоровье {level.hp}
        </div>
      </>
    );
  if (status === 'won')
    overlay = (
      <>
        <div className="result-title">Победа!</div>
        <Stars n={stars} />
        <div className="muted">{battle.player.hits} повторов</div>
      </>
    );
  if (status === 'lost')
    overlay = (
      <>
        <div className="result-title">Поражение</div>
        <div className="muted">{level.name} оказался сильнее. Попробуй ещё раз!</div>
      </>
    );

  return (
    <>
      <ArenaStage
        me={{ name: userName(), hp: battle.player.hp, maxHp: battle.player.maxHp, hits: battle.player.hits, combo: combo.player }}
        opponent={{ name: level.name, hp: battle.bot.hp, maxHp: battle.bot.maxHp, hits: battle.bot.hits, combo: combo.bot }}
        seconds={status === 'running' ? seconds : level.seconds}
        camera={camera}
        overlay={overlay}
        banner={status === 'running' ? banner : null}
        theme={zone}
        opponentColor={level.color}
        opponentScale={level.boss ? 1.35 : 1}
        enraged={status === 'running' && enraged}
      />
      <div className="hint-line">
        {status === 'running' && (camera.hint ?? 'Отлично, продолжай!')}
        {status === 'ready' && 'Поставь телефон сбоку в 1,5–2 метрах, чтобы тело было в кадре целиком.'}
        {status === 'error' && `Не удалось запустить камеру: ${error}`}
      </div>
      {status === 'running' && (
        <button className="primary" onClick={() => finish(true)}>
          Сдаться
        </button>
      )}
      {status === 'won' && hasNext && (
        <button className="primary" onClick={onNext}>
          Следующий уровень
        </button>
      )}
      {!busy && status !== 'won' && (
        <button className="primary" onClick={start}>
          {status === 'lost' ? 'Ещё раз' : 'В бой'}
        </button>
      )}
      {status === 'loading' && (
        <button className="primary" disabled>
          Загружаю модель…
        </button>
      )}
      {!busy && (
        <button className="link" onClick={onExit}>
          К карте уровней
        </button>
      )}
    </>
  );
}
