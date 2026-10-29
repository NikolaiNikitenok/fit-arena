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
import { forms, locale, t } from '../i18n';
import { cityName } from '../city/cityName';

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
const word = forms;

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
        .catch((e: { status?: number }) => !stop && setError(e.status === 401 ? t('Титан — для тех, кто вошёл через Telegram, Max или Яндекс') : t('Нет связи с сервером')));
    void load();
    // Пока Титан жив, полоска здоровья обновляется сама.
    const tm = w.live ? setInterval(load, 30_000) : undefined;
    return () => {
      stop = true;
      clearInterval(tm);
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
    setGot(t('+{0} монет{1}', { 0: n(r.coins), 1: r.outfit ? t(' и легендарный облик «{0}»', { 0: itemById(TITAN_OUTFIT).name }) : '' }));
  };

  return (
    <Sheet onClose={onClose} bodyClassName="titan-sheet" bodyStyle={{ ['--tg' as string]: def.glow, ['--tc' as string]: def.color }}>
      <div className={`titan-hero ${s?.won ? 'down' : ''}`}>
        <div className="titan-halo" />
        <MonsterFace shape="golem" color={def.color} boss angry={!s?.won} size={128} />
      </div>
      <div className="titan-name">{def.name}</div>
      <div className="titan-threat">{s?.won ? t('Повержен! Страна отстояла свои тренировки') : t('Грозит: {0}', { 0: def.threat })}</div>
      <div className="titan-when">
        {upcoming ? t('Появится 12-го: через {0}', { 0: fmtLeft(w.start - now) }) : s?.won ? t('Победа! Титан повержен') : ended ? t('Битва окончена: Титан устоял') : t('Битва идёт: ещё {0}', { 0: fmtLeft(w.end - now) })}
      </div>

      {error && <div className="error">{error}</div>}

      {!upcoming && s && s.hp != null && (
        <>
          <div className="titan-hp">
            <div className="titan-hp-fill" style={{ width: `${(1 - share) * 100}%` }} />
            <span>{s.won ? t('ПОВЕРЖЕН') : t('{0} из {1}', { 0: n(left!), 1: n(s.hp) })}</span>
          </div>
          <div className="titan-sub">
            {t('{0} {1} от {2} {3}', { 0: n(s.dealt), 1: word(s.dealt, [t('удар'), t('удара'), t('ударов')]), 2: n(s.players), 3: word(s.players, [t('героя'), t('героев'), t('героев')]) })}
          </div>
        </>
      )}

      {upcoming ? (
        <div className="titan-box">
          {t('С 12-го по 18-е каждый твой повтор — в любом режиме — удар по Титану. Если страна его одолеет, всем, кто внёс хотя бы {0} повторов: {1} монет и легендарный облик «{2}».', { 0: TITAN_MIN_REPS, 1: n(TITAN_COINS), 2: itemById(TITAN_OUTFIT).name })}
        </div>
      ) : (
        s && (
          <div className="titan-box">
            <div className="titan-me">
              <b>{n(s.me.reps)}</b>
              <span>
                {t('твой урон')}{s.me.place ? t(' · {0}-е место', { 0: s.me.place }) : ''}
                {s.myCity ? t(' · {0}: {1}-е место среди городов', { 0: s.myCity.name, 1: s.myCity.place }) : ''}
              </span>
            </div>
            {got ? (
              <div className="titan-got">{got}</div>
            ) : claimable ? (
              <button className="primary" onClick={claim}>
                {t('Забрать награду победителя')}
              </button>
            ) : claimed ? (
              <div className="titan-got">{t('Награда за этого Титана получена')}</div>
            ) : s.won ? (
              <div className="muted">{s.me.reps < TITAN_MIN_REPS ? t('Для награды нужно внести {0} повторов{1}', { 0: TITAN_MIN_REPS, 1: ended ? t(' — в следующий раз!') : t(': ещё не поздно!') }) : ''}</div>
            ) : (
              !ended && (
                <div className="muted">
                  {t('Одолеем Титана — всем, кто внёс {0}+ повторов: {1} монет и облик «{2}».', { 0: TITAN_MIN_REPS, 1: n(TITAN_COINS), 2: itemById(TITAN_OUTFIT).name })}
                </div>
              )
            )}
            {!ended && !s.won && (
              <button className="primary" onClick={onTrain}>
                {t('В бой: каждый повтор — удар')}
              </button>
            )}
          </div>
        )
      )}

      {s && (s.cities.length > 0 || s.heroes.length > 0) && (
        <>
          <div className="tabs">
            <button className={tab === 'cities' ? 'active' : ''} onClick={() => setTab('cities')}>
              {t('Города')}
            </button>
            <button className={tab === 'heroes' ? 'active' : ''} onClick={() => setTab('heroes')}>
              {t('Герои')}
            </button>
          </div>
          <div className="city-rows">
            {(tab === 'cities' ? s.cities.map((c) => ({ name: cityName(c.name), value: c.dealt, sub: `${c.players} ${word(c.players, [t('герой'), t('героя'), t('героев')])}`, me: c.mine, pro: false })) : s.heroes.map((h) => ({ name: h.name, value: h.reps, sub: '', me: h.me, pro: h.pro }))).map((r, i) => (
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
          {tab === 'cities' && !s.myCity && <div className="muted center">{t('Выбери свой город в «Битве городов» — и его урон попадёт в таблицу.')}</div>}
        </>
      )}
    </Sheet>
  );
}
