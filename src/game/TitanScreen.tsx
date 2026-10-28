import { useEffect, useState } from 'react';
import { lastTitan, TITAN_MIN_REPS, titanOf, titanWindow } from '../../shared/titan';
import { post } from '../cloud';
import { Sheet } from '../Sheet';
import { userName } from '../telegram';
import { fmtLeft } from './event';
import { itemById } from './items';
import { MonsterFace } from './match3/art';
import { type Progress, saveProgress } from './progress';
import { canClaimTitan, claimTitan, TITAN_COINS, TITAN_OUTFIT } from './titan';
import './titan.css';
import { locale } from '../i18n';

// Титан: вся страна бьёт одного босса с 12-го по 18-е число. Каждый повтор в любом режиме — удар.
// Здоровье и урон — с сервера (server/titan.ts), экран обновляется сам, пока Титан жив.

interface TitanState {
  key: string;
  start: number;
  end: number;
  live: boolean;
  hp: number | null;
  dealt: number;
  won: boolean;
  wonAt: number | null;
  players: number;
  me: { reps: number; place: number | null };
  cities: { name: string; dealt: number; players: number; mine?: boolean }[];
  heroes: { name: string; reps: number; pro?: boolean; me?: boolean }[];
  myCity: { name: string; place: number; dealt: number } | null;
}

const DAY = 86_400_000;
// После конца Титана три дня показываем его итоги и награду.
export const TITAN_AFTER_DAYS = 3;

/** Какого Титана показывать: идущего или будущего, а первые три дня после конца — итоги прошлого. */
export function shownTitan(now: number) {
  const cur = titanWindow(now);
  const last = lastTitan(now);
  return !cur.live && now - last.end < TITAN_AFTER_DAYS * DAY ? last : cur;
}

const n = (x: number) => x.toLocaleString(locale());
const word = (x: number, f: [string, string, string]) => {
  const m10 = x % 10;
  const m100 = x % 100;
  return f[m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 1 : 2];
};

export function TitanScreen({ progress, setProgress, onTrain, onClose }: { progress: Progress; setProgress: (p: Progress) => void; onTrain: () => void; onClose: () => void }) {
  const now = Date.now();
  const w = shownTitan(now);
  const def = titanOf(w.key, now).def;
  const [s, setS] = useState<TitanState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'cities' | 'heroes'>('cities');
  const [got, setGot] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const load = () =>
      post('/api/titan', { key: w.key, name: userName() })
        .then((r) => !stop && (setS(r as TitanState), setError(null)))
        .catch((e: { status?: number }) => !stop && setError(e.status === 401 ? 'Титан — для тех, кто вошёл через Telegram, Max или Яндекс' : 'Нет связи с сервером'));
    void load();
    // Пока Титан жив, полоска здоровья обновляется сама.
    const t = w.live ? setInterval(load, 30_000) : undefined;
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [w.key, w.live]);

  const left = s?.hp != null ? Math.max(0, s.hp - s.dealt) : null;
  const share = s?.hp ? Math.min(1, s.dealt / s.hp) : 0;
  const ended = now >= w.end;
  const upcoming = now < w.start;
  const claimable = !!s && canClaimTitan(progress, s.key, s.won, s.me.reps);
  const claimed = !!progress.titanClaimed?.includes(w.key);

  const claim = () => {
    if (!s) return;
    const r = claimTitan(progress, s.key, Date.now());
    setProgress(saveProgress(r.progress));
    setGot(`+${n(r.coins)} монет${r.outfit ? ` и легендарный облик «${itemById(TITAN_OUTFIT).name}»` : ''}`);
  };

  return (
    <Sheet onClose={onClose} bodyClassName="titan-sheet" bodyStyle={{ ['--tg' as string]: def.glow, ['--tc' as string]: def.color }}>
      <div className={`titan-hero ${s?.won ? 'down' : ''}`}>
        <div className="titan-halo" />
        <MonsterFace shape="golem" color={def.color} boss angry={!s?.won} size={128} />
      </div>
      <div className="titan-name">{def.name}</div>
      <div className="titan-threat">{s?.won ? 'Повержен! Страна отстояла свои тренировки' : `Грозит: ${def.threat}`}</div>
      <div className="titan-when">
        {upcoming ? `Появится 12-го: через ${fmtLeft(w.start - now)}` : s?.won ? 'Победа! Титан повержен' : ended ? 'Битва окончена: Титан устоял' : `Битва идёт: ещё ${fmtLeft(w.end - now)}`}
      </div>

      {error && <div className="error">{error}</div>}

      {!upcoming && s && s.hp != null && (
        <>
          <div className="titan-hp">
            <div className="titan-hp-fill" style={{ width: `${(1 - share) * 100}%` }} />
            <span>{s.won ? 'ПОВЕРЖЕН' : `${n(left!)} из ${n(s.hp)}`}</span>
          </div>
          <div className="titan-sub">
            {n(s.dealt)} {word(s.dealt, ['удар', 'удара', 'ударов'])} от {n(s.players)} {word(s.players, ['героя', 'героев', 'героев'])}
          </div>
        </>
      )}

      {upcoming ? (
        <div className="titan-box">
          С 12-го по 18-е каждый твой повтор — в любом режиме — удар по Титану. Если страна его одолеет, всем, кто внёс хотя бы {TITAN_MIN_REPS} повторов: {n(TITAN_COINS)} монет и легендарный облик «{itemById(TITAN_OUTFIT).name}».
        </div>
      ) : (
        s && (
          <div className="titan-box">
            <div className="titan-me">
              <b>{n(s.me.reps)}</b>
              <span>
                твой урон{s.me.place ? ` · ${s.me.place}-е место` : ''}
                {s.myCity ? ` · ${s.myCity.name}: ${s.myCity.place}-е место среди городов` : ''}
              </span>
            </div>
            {got ? (
              <div className="titan-got">{got}</div>
            ) : claimable ? (
              <button className="primary" onClick={claim}>
                Забрать награду победителя
              </button>
            ) : claimed ? (
              <div className="titan-got">Награда за этого Титана получена</div>
            ) : s.won ? (
              <div className="muted">{s.me.reps < TITAN_MIN_REPS ? `Для награды нужно внести ${TITAN_MIN_REPS} повторов${ended ? ' — в следующий раз!' : ': ещё не поздно!'}` : ''}</div>
            ) : (
              !ended && (
                <div className="muted">
                  Одолеем Титана — всем, кто внёс {TITAN_MIN_REPS}+ повторов: {n(TITAN_COINS)} монет и облик «{itemById(TITAN_OUTFIT).name}».
                </div>
              )
            )}
            {!ended && !s.won && (
              <button className="primary" onClick={onTrain}>
                В бой: каждый повтор — удар
              </button>
            )}
          </div>
        )
      )}

      {s && (s.cities.length > 0 || s.heroes.length > 0) && (
        <>
          <div className="tabs">
            <button className={tab === 'cities' ? 'active' : ''} onClick={() => setTab('cities')}>
              Города
            </button>
            <button className={tab === 'heroes' ? 'active' : ''} onClick={() => setTab('heroes')}>
              Герои
            </button>
          </div>
          <div className="city-rows">
            {(tab === 'cities' ? s.cities.map((c) => ({ name: c.name, value: c.dealt, sub: `${c.players} ${word(c.players, ['герой', 'героя', 'героев'])}`, me: c.mine, pro: false })) : s.heroes.map((h) => ({ name: h.name, value: h.reps, sub: '', me: h.me, pro: h.pro }))).map((r, i) => (
              <div key={`${tab}${i}`} className={`city-row p${i + 1} ${r.me ? 'me' : ''}`}>
                <span className="place">{i + 1}</span>
                <span className="who">
                  <b className={r.pro ? 'pro-name' : ''}>{r.name}</b>
                  {r.sub && <small>{r.sub}</small>}
                </span>
                <span className="reps">{n(r.value)}</span>
              </div>
            ))}
          </div>
          {tab === 'cities' && !s.myCity && <div className="muted center">Выбери свой город в «Битве городов» — и его урон попадёт в таблицу.</div>}
        </>
      )}
    </Sheet>
  );
}
