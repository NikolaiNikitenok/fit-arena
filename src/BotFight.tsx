import { useRef, useState } from 'react';
import { ArenaStage } from './ArenaStage';
import { Battle, BOT_LEVELS, newBattle, nextBotDelay, Side, strike, winner } from '../shared/battle';
import { Exercise, EXERCISE_LABELS } from './repCounter';
import { userName } from './telegram';
import { useRepCamera } from './useRepCamera';

const ROUND_SECONDS = 60;

type Status = 'idle' | 'loading' | 'running' | 'finished' | 'error';

const RESULT_TEXT: Record<Side | 'draw', string> = { player: 'Победа!', bot: 'Поражение', draw: 'Ничья' };

export function BotFight({ exercise }: { exercise: Exercise }) {
  const camera = useRepCamera();
  const [level, setLevel] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [battle, setBattle] = useState<Battle>(newBattle);
  const [combo, setCombo] = useState<Record<Side, boolean>>({ player: false, bot: false });
  const [seconds, setSeconds] = useState(ROUND_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const battleRef = useRef(battle);
  const botTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const over = useRef(false);

  const finish = () => {
    over.current = true;
    clearTimeout(botTimer.current);
    camera.stop();
    setStatus('finished');
  };

  const hit = (side: Side) => {
    if (over.current) return;
    const r = strike(battleRef.current, side, performance.now());
    battleRef.current = r.battle;
    setBattle(r.battle);
    setCombo((c) => ({ ...c, [side]: r.strike.combo }));
    if (winner(r.battle, false)) finish();
  };

  const start = async () => {
    setError(null);
    setStatus('loading');
    const fresh = newBattle();
    battleRef.current = fresh;
    setBattle(fresh);
    setCombo({ player: false, bot: false });
    over.current = false;
    try {
      // Время считаем по часам, а не по таймеру: на слабых телефонах таймеры отстают.
      let endAt = 0;
      await camera.start(
        exercise,
        () => hit('player'),
        () => {
          endAt ||= performance.now() + ROUND_SECONDS * 1000;
          const left = Math.max(0, Math.ceil((endAt - performance.now()) / 1000));
          setSeconds(left);
          if (left === 0 && !over.current) finish();
          return !over.current;
        },
      );
      const bot = BOT_LEVELS[level];
      const scheduleBot = () => {
        botTimer.current = setTimeout(() => {
          hit('bot');
          if (!over.current) scheduleBot();
        }, nextBotDelay(bot));
      };
      scheduleBot();
      setStatus('running');
    } catch (e) {
      finish();
      setError(e instanceof Error ? e.message : 'не загрузилась модель распознавания');
      setStatus('error');
    }
  };

  const bot = BOT_LEVELS[level];
  const result = status === 'finished' ? winner(battle, true) : null;
  const busy = status === 'loading' || status === 'running';

  return (
    <>
      <ArenaStage
        me={{ name: userName(), hp: battle.player.hp, hits: battle.player.hits, combo: combo.player }}
        opponent={{ name: bot.name, hp: battle.bot.hp, hits: battle.bot.hits, combo: combo.bot }}
        seconds={status === 'running' ? seconds : ROUND_SECONDS}
        camera={camera}
        overlay={
          result && (
            <>
              <div className="result-title">{RESULT_TEXT[result]}</div>
              <div className="muted">
                {EXERCISE_LABELS[exercise]}: {battle.player.hits} повторов
              </div>
            </>
          )
        }
      />
      <div className="hint-line">
        {status === 'running' && (camera.hint ?? 'Отлично, продолжай!')}
        {status === 'idle' && 'Поставь телефон сбоку в 1,5–2 метрах, чтобы тело было в кадре целиком.'}
        {status === 'error' && `Не удалось запустить камеру: ${error}`}
      </div>
      {!busy && (
        <div className="tabs">
          {BOT_LEVELS.map((l, i) => (
            <button key={l.name} className={i === level ? 'active' : ''} onClick={() => setLevel(i)}>
              {l.name}
            </button>
          ))}
        </div>
      )}
      {status === 'running' ? (
        <button className="primary" onClick={finish}>
          Сдаться
        </button>
      ) : (
        <button className="primary" disabled={status === 'loading'} onClick={start}>
          {status === 'loading' ? 'Загружаю модель…' : status === 'finished' ? 'Реванш' : 'В бой'}
        </button>
      )}
    </>
  );
}
