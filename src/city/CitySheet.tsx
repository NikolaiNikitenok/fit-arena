import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { canonicalKey, citySuggest } from '../../shared/cityNames';
import { RU_CITIES } from '../../shared/russiaCities';
import { City } from '../icons';
import { Sheet } from '../Sheet';
import { type CityBoard, cityApi, NotSignedIn } from './api';
import type { MapCity } from './RussiaMap';
import '../game/holiday.css';
import './city.css';
import { locale } from '../i18n';

// Битва городов: карта России, где города светятся своими повторами за неделю (с понедельника по Москве),
// рейтинг городов по повторам, героям или сильнейшему герою, свой город и место в нём.

const RussiaMap = lazy(() => import('./RussiaMap').then((m) => ({ default: m.RussiaMap })));

const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('ru', { day: 'numeric', month: 'long' });
const word = (n: number, forms: [string, string, string]) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return forms[m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 1 : 2];
};
/** Коротко для карты: 9 870, 12,4 тыс., 1,2 млн. */
const compact = (n: number) => (n < 10_000 ? n.toLocaleString(locale()) : n < 1_000_000 ? `${(n / 1000).toLocaleString('ru', { maximumFractionDigits: 1 })} тыс.` : `${(n / 1_000_000).toLocaleString('ru', { maximumFractionDigits: 1 })} млн`);

type Metric = 'reps' | 'players' | 'best';
type BoardCity = CityBoard['cities'][number];

const METRICS: { id: Metric; title: string; value: (c: BoardCity) => number; label: (n: number) => string; long: (n: number) => string }[] = [
  { id: 'reps', title: 'Повторы', value: (c) => c.reps, label: compact, long: (n) => `${n.toLocaleString(locale())} ${word(n, ['повтор', 'повтора', 'повторов'])} за неделю` },
  { id: 'players', title: 'Герои', value: (c) => c.players, label: (n) => `${n} ${word(n, ['герой', 'героя', 'героев'])}`, long: (n) => `${n} ${word(n, ['герой тренировался', 'героя тренировались', 'героев тренировались'])} на этой неделе` },
  { id: 'best', title: 'Сильнейший', value: (c) => c.best ?? 0, label: (n) => `ур. ${n}`, long: (n) => `сильнейший герой — ${n} уровня` },
];

export function CitySheet({ onClose }: { onClose: () => void }) {
  const [board, setBoard] = useState<CityBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guest, setGuest] = useState(false);
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState('');
  const [tab, setTab] = useState<'city' | 'cities'>('cities');
  const [busy, setBusy] = useState(false);
  const [metric, setMetric] = useState<Metric>('reps');
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ key: string; n: number } | undefined>();

  const run = (p: Promise<CityBoard>) => {
    setBusy(true);
    p.then((b) => {
      setBoard(b);
      setError(null);
      setEdit(!b.city);
      setText(b.city ?? b.suggest ?? '');
      if (b.city) setTab('city');
    })
      .catch((e) => (e instanceof NotSignedIn ? setGuest(true) : setError((e as Error).message)))
      .finally(() => setBusy(false));
  };
  useEffect(() => run(cityApi.board()), []);

  const save = (city = text.trim()) => city && run(cityApi.set(city));
  const m = METRICS.find((x) => x.id === metric)!;

  // Рейтинг городов по выбранному показателю и точки на карте.
  const ranked = useMemo(() => (board?.cities ?? []).filter((c) => m.value(c) > 0).sort((a, b) => m.value(b) - m.value(a) || b.members - a.members), [board, m]);
  const byKey = useMemo(() => new Map((board?.cities ?? []).map((c) => [canonicalKey(c.city), c])), [board]);
  const place = useMemo(() => new Map(ranked.map((c, i) => [canonicalKey(c.city), i + 1])), [ranked]);
  const mapCities = useMemo<MapCity[]>(
    () =>
      RU_CITIES.map(([name, x, y, popK]) => {
        const key = canonicalKey(name);
        const c = byKey.get(key);
        const value = c ? m.value(c) : 0;
        return { key, name, x, y, popK, value, label: m.label(value), place: place.get(key), mine: c?.mine };
      }),
    [byKey, place, m],
  );
  const onMap = useMemo(() => new Set(mapCities.map((c) => c.key)), [mapCities]);

  const sel = selected ? (byKey.get(selected) ?? null) : null;
  const selName = selected ? (mapCities.find((c) => c.key === selected)?.name ?? sel?.city ?? '') : '';
  const pick = (key: string) => {
    setSelected(key);
    if (!onMap.has(key)) return;
    setFocus((f) => ({ key, n: (f?.n ?? 0) + 1 }));
    document.querySelector('.rmap')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const suggestions = edit ? citySuggest(text).filter((c) => c !== text.trim()) : [];

  return (
    <Sheet onClose={onClose} bodyClassName="hol-sheet city-sheet">
      <div className="level-title">
        <City size={20} /> Битва городов
      </div>
      {board && (
        <div className="muted">
          Неделя {fmtDay(board.from)} – {fmtDay(board.to)}: каждый повтор зажигает твой город. В понедельник всё начинается заново.
        </div>
      )}
      {guest && <div className="city-empty">Битва городов — для тех, кто вошёл через Telegram, Max или Яндекс. Войди в настройках, и твои повторы зажгут твой город.</div>}
      {!board && !guest && !error && <div className="city-empty">Загружаем…</div>}
      {error && <div className="error">{error}</div>}

      {board && (
        <>
          <div className="tabs city-metric">
            {METRICS.map((x) => (
              <button key={x.id} className={metric === x.id ? 'active' : ''} onClick={() => setMetric(x.id)}>
                {x.title}
              </button>
            ))}
          </div>
          <Suspense fallback={<div className="rmap" />}>
            <RussiaMap cities={mapCities} selected={selected} onSelect={setSelected} focus={focus} />
          </Suspense>

          {selected && (
            <div className={`city-card${sel?.mine ? ' mine' : ''}`}>
              <div className="city-card-head">
                <b>{selName}</b>
                {place.get(selected) && <span className="city-place">{place.get(selected)}-е место</span>}
                <button className="sheet-x city-card-x" onClick={() => setSelected(null)} aria-label="Закрыть">
                  ×
                </button>
              </div>
              {sel && (sel.reps > 0 || sel.members > 0) ? (
                <div className="city-card-stats">
                  <span>
                    <b>{sel.reps.toLocaleString(locale())}</b> {word(sel.reps, ['повтор', 'повтора', 'повторов'])}
                  </span>
                  <span>
                    <b>{sel.players}</b> из {sel.members} {word(sel.members, ['героя', 'героев', 'героев'])} в деле
                  </span>
                  {sel.best != null && (
                    <span>
                      сильнейший — <b>ур. {sel.best}</b>
                    </span>
                  )}
                </div>
              ) : (
                <div className="muted">Здесь пока никто не сражается. Зажги этот город первым!</div>
              )}
              {!sel?.mine && (
                <button className="small-btn" disabled={busy} onClick={() => save(selName)}>
                  Это мой город
                </button>
              )}
            </div>
          )}
        </>
      )}

      {board && edit && (
        <>
          <div className="section-title">{board.city ? 'Сменить город' : 'За какой город ты сражаешься?'}</div>
          <div className="city-form">
            <input value={text} maxLength={30} placeholder="Москва" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
            <button className="small-btn" disabled={busy || !text.trim()} onClick={() => save()}>
              Готово
            </button>
          </div>
          {(suggestions.length > 0 || board.suggest || ranked.length > 0) && (
            <div className="city-suggest">
              {(suggestions.length ? suggestions : [board.suggest, ...ranked.map((c) => c.city)])
                .filter((c, i, a): c is string => !!c && a.indexOf(c) === i)
                .slice(0, 8)
                .map((c) => (
                  <button key={c} onClick={() => setText(c)}>
                    {c}
                  </button>
                ))}
            </div>
          )}
          {board.city && (
            <button className="link" onClick={() => run(cityApi.set(null))}>
              Убрать меня из битвы городов
            </button>
          )}
        </>
      )}

      {board?.city && !edit && (
        <div className="city-me">
          <b>{board.me?.reps ? board.me.place : '—'}</b>
          <div>
            <strong>{board.city}</strong>
            <small>
              {board.me?.reps
                ? `${board.me.place}-е место из ${board.me.players} · ${board.me.reps.toLocaleString(locale())} ${word(board.me.reps, ['повтор', 'повтора', 'повторов'])} за неделю`
                : 'На этой неделе ещё нет повторов: начни тренировку'}
            </small>
          </div>
          <button className="link" onClick={() => setEdit(true)}>
            Сменить
          </button>
        </div>
      )}

      {board && (
        <>
          <div className="tabs">
            <button className={tab === 'city' ? 'active' : ''} onClick={() => setTab('city')}>
              {board.city ?? 'Мой город'}
            </button>
            <button className={tab === 'cities' ? 'active' : ''} onClick={() => setTab('cities')}>
              Все города
            </button>
          </div>
          {tab === 'city' ? (
            !board.city ? (
              <div className="city-empty">Выбери город, чтобы увидеть его топ.</div>
            ) : board.top.length === 0 ? (
              <div className="city-empty">В городе {board.city} на этой неделе пока никто не тренировался. Будь первым!</div>
            ) : (
              <div className="city-rows">
                {board.top.map((r, i) => (
                  <div key={i} className={`city-row p${i + 1} ${r.me ? 'me' : ''}`}>
                    <span className="place">{i + 1}</span>
                    <span className="who">
                      <b className={r.pro ? 'pro-name' : ''}>{r.name}</b>
                      {r.level != null && <small>уровень {r.level}</small>}
                    </span>
                    <span className="reps">{r.reps.toLocaleString(locale())}</span>
                  </div>
                ))}
              </div>
            )
          ) : ranked.length === 0 ? (
            <div className="city-empty">На этой неделе ещё ни один город не тренировался.</div>
          ) : (
            <div className="city-rows">
              {[...ranked.slice(0, 50), ...ranked.slice(50).filter((c) => c.mine)].map((c) => {
                const key = canonicalKey(c.city);
                const n = m.value(c);
                return (
                  <button key={key} className={`city-row p${place.get(key)} ${c.mine ? 'me' : ''} ${key === selected ? 'sel' : ''}`} onClick={() => pick(key)}>
                    <span className="place">{place.get(key)}</span>
                    <span className="who">
                      <b>{c.city}</b>
                      <small>{onMap.has(key) ? m.long(n) : `${m.long(n)} · не на карте`}</small>
                    </span>
                    <span className="reps">{metric === 'best' ? n : metric === 'players' ? n : compact(n)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
