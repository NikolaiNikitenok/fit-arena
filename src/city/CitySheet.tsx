import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { canonicalKey, cityCountry, citySuggest, knownCity } from '../../shared/cityNames';
import { COUNTRIES } from '../../shared/countries';
import { countryInfo } from '../../shared/countryNames';
import { City } from '../icons';
import { Sheet } from '../Sheet';
import { type CityBoard, type CityStat, type CountryStat, cityApi, NotSignedIn } from './api';
import type { GlobeCity, GlobeCountry, GlobeSel } from './Globe';
import '../game/holiday.css';
import './city.css';
import { forms, isEn, locale, t } from '../i18n';
import { cityName, countryName, flag } from './cityName';

// Битва городов: глобус, где страны окрашены своими повторами за неделю (с понедельника по Москве),
// а над городами светятся столбы; рейтинг стран и городов мира по повторам, героям или сильнейшему герою,
// свой город и место в нём.

const Globe = lazy(() => import('./Globe').then((m) => ({ default: m.Globe })));

const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'long' });
const word = forms;
/** Коротко для подписей: 9 870, 12,4 тыс., 1,2 млн. */
const compact = (n: number) => (n < 10_000 ? n.toLocaleString(locale()) : n < 1_000_000 ? t('{0} тыс.', { 0: (n / 1000).toLocaleString(locale(), { maximumFractionDigits: 1 }) }) : t('{0} млн', { 0: (n / 1_000_000).toLocaleString(locale(), { maximumFractionDigits: 1 }) }));

type Metric = 'reps' | 'players' | 'best';
type Stat = Pick<CityStat, 'reps' | 'players' | 'best' | 'members'>;
type Tab = 'city' | 'countries' | 'cities';

const METRICS: { id: Metric; title: string; value: (c: Stat) => number; label: (n: number) => string; long: (n: number) => string }[] = [
  { id: 'reps', title: t('Повторы'), value: (c) => c.reps, label: compact, long: (n) => t('{0} {1} за неделю', { 0: n.toLocaleString(locale()), 1: word(n, [t('повтор'), t('повтора'), t('повторов')]) }) },
  { id: 'players', title: t('Герои'), value: (c) => c.players, label: (n) => `${n} ${word(n, [t('герой'), t('героя'), t('героев')])}`, long: (n) => t('{0} {1} на этой неделе', { 0: n, 1: word(n, [t('герой тренировался'), t('героя тренировались'), t('героев тренировались')]) }) },
  { id: 'best', title: t('Сильнейший'), value: (c) => c.best ?? 0, label: (n) => t('ур. {0}', { 0: n }), long: (n) => t('сильнейший герой — {0} уровня', { 0: n }) },
];

/** Ключ города в рейтинге: город из справочника — по названию, иначе вместе со страной. */
const statKey = (c: CityStat) => (knownCity(c.city) ? canonicalKey(c.city) : `${canonicalKey(c.city)}|${c.country ?? ''}`);

// Страны по алфавиту для выбора страны города не из справочника.
const sortedCountries = () => [...COUNTRIES].sort((a, b) => (isEn() ? a[2] : a[1]).localeCompare(isEn() ? b[2] : b[1], locale()));

export function CitySheet({ onClose }: { onClose: () => void }) {
  const [board, setBoard] = useState<CityBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guest, setGuest] = useState(false);
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState('');
  const [country, setCountry] = useState('RU');
  const [tab, setTab] = useState<Tab>('countries');
  const [busy, setBusy] = useState(false);
  const [metric, setMetric] = useState<Metric>('reps');
  const [selected, setSelected] = useState<GlobeSel>(null);
  const [only, setOnly] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lon: number; zoom?: number; n: number } | undefined>();

  const fly = (lat: number, lon: number, zoom?: number) => setFocus((f) => ({ lat, lon, zoom, n: (f?.n ?? 0) + 1 }));

  const run = (p: Promise<CityBoard>, first = false) => {
    setBusy(true);
    p.then((b) => {
      setBoard(b);
      setError(null);
      setEdit(!b.city);
      setText(cityName(b.city ?? b.suggest ?? ''));
      setCountry(b.country ?? b.suggestCountry ?? 'RU');
      if (b.city) setTab('city');
      // Глобус сразу смотрит на свой город.
      const home = b.city && knownCity(b.city);
      if (first && home) fly(home[3], home[4], 3.1);
      else if (first && b.country && countryInfo(b.country)) fly(countryInfo(b.country)![3], countryInfo(b.country)![4], 3.1);
    })
      .catch((e) => (e instanceof NotSignedIn ? setGuest(true) : setError((e as Error).message)))
      .finally(() => setBusy(false));
  };
  useEffect(() => run(cityApi.board(), true), []);

  const typedKnown = knownCity(text.trim());
  const save = (city = text.trim(), c = country) => city && run(cityApi.set(city, cityCountry(city) ? undefined : c));
  const m = METRICS.find((x) => x.id === metric)!;

  // Рейтинги по выбранному показателю.
  const cities = board?.cities ?? [];
  const countries = board?.countries ?? [];
  const ranked = useMemo(() => cities.filter((c) => m.value(c) > 0).sort((a, b) => m.value(b) - m.value(a) || b.members - a.members), [cities, m]);
  const place = useMemo(() => new Map(ranked.map((c, i) => [statKey(c), i + 1])), [ranked]);
  const rankedCountries = useMemo(() => countries.filter((c) => m.value(c) > 0).sort((a, b) => m.value(b) - m.value(a) || b.members - a.members), [countries, m]);
  const countryPlace = useMemo(() => new Map(rankedCountries.map((c, i) => [c.country, i + 1])), [rankedCountries]);
  const byKey = useMemo(() => new Map(cities.map((c) => [statKey(c), c])), [cities]);
  const byCountry = useMemo(() => new Map(countries.map((c) => [c.country, c])), [countries]);

  // Глобус: все страны с героями и города из справочника, где кто-то есть.
  const globeCountries = useMemo<GlobeCountry[]>(
    () =>
      countries.flatMap((c) => {
        const info = countryInfo(c.country);
        if (!info) return [];
        const value = m.value(c);
        return [{ code: c.country, name: countryName(c.country), lat: info[3], lon: info[4], value, label: m.label(value), mine: c.mine }];
      }),
    [countries, m],
  );
  const globeCities = useMemo<GlobeCity[]>(() => {
    const out: GlobeCity[] = [];
    for (const c of cities) {
      const k = knownCity(c.city);
      if (!k) continue;
      const value = m.value(c);
      out.push({ key: statKey(c), name: cityName(c.city), lat: k[3], lon: k[4], value, label: m.label(value), mine: c.mine, place: place.get(statKey(c)) });
    }
    // Выбранный город из справочника, где пока никого нет, — тоже на глобусе.
    if (selected?.kind === 'city' && !byKey.has(selected.key)) {
      const k = knownCity(selected.key);
      if (k) out.push({ key: selected.key, name: cityName(k[0]), lat: k[3], lon: k[4], value: 0, label: '' });
    }
    return out;
  }, [cities, m, place, selected, byKey]);

  const pickCity = (c: CityStat) => {
    const key = statKey(c);
    setSelected({ kind: 'city', key });
    const k = knownCity(c.city);
    if (k) fly(k[3], k[4], 2.0);
    document.querySelector('.globe')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const pickCountry = (code: string) => {
    setSelected({ kind: 'country', key: code });
    const info = countryInfo(code);
    if (info) fly(info[3], info[4], 2.8);
    document.querySelector('.globe')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const suggestions = edit ? citySuggest(text).filter((c) => c !== text.trim()) : [];
  const selCity = selected?.kind === 'city' ? (byKey.get(selected.key) ?? null) : null;
  const selCityName = selected?.kind === 'city' ? cityName(selCity?.city ?? knownCity(selected.key)?.[0] ?? selected.key) : '';
  const selCityCountry = selected?.kind === 'city' ? (selCity?.country ?? knownCity(selected.key)?.[2] ?? null) : null;
  const selCountry: CountryStat | null = selected?.kind === 'country' ? (byCountry.get(selected.key) ?? null) : null;
  const countryCities = selected?.kind === 'country' ? ranked.filter((c) => c.country === selected.key) : [];
  const listed = only ? ranked.filter((c) => c.country === only) : ranked;

  const stats = (s: Stat, who: string) => (
    <div className="city-card-stats">
      <span>
        <b>{s.reps.toLocaleString(locale())}</b> {word(s.reps, [t('повтор'), t('повтора'), t('повторов')])}
      </span>
      <span>
        <b>{s.players}</b> {t('из {0} {1} в деле', { 0: s.members, 1: word(s.members, [t('героя'), t('героев'), t('героев')]) })}
      </span>
      {s.best != null && (
        <span>
          {t('сильнейший —')} <b>{t('ур. {0}', { 0: s.best })}</b>
        </span>
      )}
      {who && <span>{who}</span>}
    </div>
  );

  return (
    <Sheet onClose={onClose} bodyClassName="hol-sheet city-sheet">
      <div className="level-title">
        <City size={20} /> {t('Битва городов')}
      </div>
      {board && (
        <div className="muted">
          {t('Неделя {0} – {1}: каждый повтор зажигает твой город и твою страну. В понедельник всё начинается заново.', { 0: fmtDay(board.from), 1: fmtDay(board.to) })}
        </div>
      )}
      {guest && <div className="city-empty">{t('Битва городов — для тех, кто вошёл через Telegram, Max или Яндекс. Войди в настройках, и твои повторы зажгут твой город.')}</div>}
      {!board && !guest && !error && <div className="city-empty">{t('Загружаем…')}</div>}
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
          <Suspense fallback={<div className="globe" />}>
            <Globe countries={globeCountries} cities={globeCities} selected={selected} onSelect={setSelected} focus={focus} />
          </Suspense>
          <div className="globe-legend">
            <span>{t('меньше')}</span>
            <i />
            <span>{t('больше')}</span>
            <span className="globe-legend-mine">{t('мой город')}</span>
          </div>

          {selected?.kind === 'country' && (
            <div className={`city-card${selCountry?.mine ? ' mine' : ''}`}>
              <div className="city-card-head">
                <b>
                  {flag(selected.key)} {countryName(selected.key)}
                </b>
                {countryPlace.get(selected.key) && <span className="city-place">{t('{0}-е место', { 0: countryPlace.get(selected.key) })}</span>}
                <button className="sheet-x city-card-x" onClick={() => setSelected(null)} aria-label={t('Закрыть')}>
                  ×
                </button>
              </div>
              {selCountry && (selCountry.reps > 0 || selCountry.members > 0) ? (
                <>
                  {stats(selCountry, `${selCountry.cities} ${word(selCountry.cities, [t('город'), t('города'), t('городов')])}`)}
                  {countryCities.length > 0 && (
                    <div className="globe-mini">
                      {countryCities.slice(0, 5).map((c, i) => (
                        <button key={statKey(c)} className={c.mine ? 'me' : ''} onClick={() => pickCity(c)}>
                          <span>{i + 1}</span> {cityName(c.city)} <b>{m.label(m.value(c))}</b>
                        </button>
                      ))}
                    </div>
                  )}
                  {countryCities.length > 5 && (
                    <button
                      className="link"
                      onClick={() => {
                        setOnly(selected.key);
                        setTab('cities');
                      }}
                    >
                      {t('Все города страны')}
                    </button>
                  )}
                </>
              ) : (
                <div className="muted">{t('Здесь пока никто не сражается. Зажги эту страну первым!')}</div>
              )}
            </div>
          )}

          {selected?.kind === 'city' && (
            <div className={`city-card${selCity?.mine ? ' mine' : ''}`}>
              <div className="city-card-head">
                <b>{selCityName}</b>
                {selCityCountry && (
                  <button className="link city-card-country" onClick={() => pickCountry(selCityCountry)}>
                    {flag(selCityCountry)} {countryName(selCityCountry)}
                  </button>
                )}
                {place.get(selected.key) && <span className="city-place">{t('{0}-е место', { 0: place.get(selected.key) })}</span>}
                <button className="sheet-x city-card-x" onClick={() => setSelected(null)} aria-label={t('Закрыть')}>
                  ×
                </button>
              </div>
              {selCity && (selCity.reps > 0 || selCity.members > 0) ? stats(selCity, '') : <div className="muted">{t('Здесь пока никто не сражается. Зажги этот город первым!')}</div>}
              {!selCity?.mine && (
                <button className="small-btn" disabled={busy} onClick={() => save(selCity?.city ?? knownCity(selected.key)?.[0] ?? selCityName, selCityCountry ?? country)}>
                  {t('Это мой город')}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {board && edit && (
        <>
          <div className="section-title">{board.city ? t('Сменить город') : t('За какой город ты сражаешься?')}</div>
          <div className="city-form">
            <input value={text} maxLength={30} placeholder={t('Москва')} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
            <button className="small-btn" disabled={busy || !text.trim()} onClick={() => save()}>
              {t('Готово')}
            </button>
          </div>
          {text.trim().length > 1 &&
            (typedKnown ? (
              <div className="muted city-country-hint">
                {flag(typedKnown[2])} {countryName(typedKnown[2])}
              </div>
            ) : suggestions.length > 0 ? null : (
              <label className="city-country">
                <span>{t('Страна')}</span>
                <select value={country} onChange={(e) => setCountry(e.target.value)}>
                  {sortedCountries().map((c) => (
                    <option key={c[0]} value={c[0]}>
                      {isEn() ? c[2] : c[1]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          {(suggestions.length > 0 || board.suggest || ranked.length > 0) && (
            <div className="city-suggest">
              {(suggestions.length ? suggestions : [board.suggest, ...ranked.map((c) => c.city)])
                .filter((c, i, a): c is string => !!c && a.indexOf(c) === i)
                .slice(0, 8)
                .map((c) => {
                  const k = knownCity(c);
                  return (
                    <button key={c} onClick={() => setText(cityName(c))}>
                      {k && k[2] !== 'RU' ? `${flag(k[2])} ` : ''}
                      {cityName(c)}
                    </button>
                  );
                })}
            </div>
          )}
          {board.city && (
            <button className="link" onClick={() => run(cityApi.set(null))}>
              {t('Убрать меня из битвы городов')}
            </button>
          )}
        </>
      )}

      {board?.city && !edit && (
        <div className="city-me">
          <b>{board.me?.reps ? board.me.place : '—'}</b>
          <div>
            <strong>
              {cityName(board.city)}
              {board.country && <span className="city-me-country"> · {flag(board.country)} {countryName(board.country)}</span>}
            </strong>
            <small>
              {board.me?.reps
                ? t('{0}-е место из {1} · {2} {3} за неделю', { 0: board.me.place, 1: board.me.players, 2: board.me.reps.toLocaleString(locale()), 3: word(board.me.reps, [t('повтор'), t('повтора'), t('повторов')]) })
                : t('На этой неделе ещё нет повторов: начни тренировку')}
            </small>
          </div>
          <button className="link" onClick={() => setEdit(true)}>
            {t('Сменить')}
          </button>
        </div>
      )}

      {board && (
        <>
          <div className="tabs">
            <button className={tab === 'city' ? 'active' : ''} onClick={() => setTab('city')}>
              {board.city ? cityName(board.city) : t('Мой город')}
            </button>
            <button className={tab === 'countries' ? 'active' : ''} onClick={() => setTab('countries')}>
              {t('Страны')}
            </button>
            <button
              className={tab === 'cities' ? 'active' : ''}
              onClick={() => {
                setTab('cities');
                setOnly(null);
              }}
            >
              {t('Города')}
            </button>
          </div>
          {tab === 'city' ? (
            !board.city ? (
              <div className="city-empty">{t('Выбери город, чтобы увидеть его топ.')}</div>
            ) : board.top.length === 0 ? (
              <div className="city-empty">{t('В городе {0} на этой неделе пока никто не тренировался. Будь первым!', { 0: cityName(board.city) })}</div>
            ) : (
              <div className="city-rows">
                {board.top.map((r, i) => (
                  <div key={i} className={`city-row p${i + 1} ${r.me ? 'me' : ''}`}>
                    <span className="place">{i + 1}</span>
                    <span className="who">
                      <b className={r.pro ? 'pro-name' : ''}>{r.name}</b>
                      {r.level != null && <small>{t('уровень {0}', { 0: r.level })}</small>}
                    </span>
                    <span className="reps">{r.reps.toLocaleString(locale())}</span>
                  </div>
                ))}
              </div>
            )
          ) : tab === 'countries' ? (
            rankedCountries.length === 0 ? (
              <div className="city-empty">{t('На этой неделе ещё ни одна страна не тренировалась.')}</div>
            ) : (
              <div className="city-rows">
                {[...rankedCountries.slice(0, 50), ...rankedCountries.slice(50).filter((c) => c.mine)].map((c) => {
                  const n = m.value(c);
                  const pl = countryPlace.get(c.country);
                  return (
                    <button
                      key={c.country}
                      className={`city-row flagged p${pl} ${c.mine ? 'me' : ''} ${selected?.kind === 'country' && selected.key === c.country ? 'sel' : ''}`}
                      onClick={() => pickCountry(c.country)}
                    >
                      <span className="place">{pl}</span>
                      <span className="flag">{flag(c.country)}</span>
                      <span className="who">
                        <b>{countryName(c.country)}</b>
                        <small>
                          {m.long(n)} · {c.cities} {word(c.cities, [t('город'), t('города'), t('городов')])}
                        </small>
                      </span>
                      <span className="reps">{metric === 'reps' ? compact(n) : n}</span>
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            <>
              {only && (
                <div className="city-filter">
                  {flag(only)} {countryName(only)}
                  <button className="link" onClick={() => setOnly(null)}>
                    {t('Весь мир')}
                  </button>
                </div>
              )}
              {listed.length === 0 ? (
                <div className="city-empty">{t('На этой неделе ещё ни один город не тренировался.')}</div>
              ) : (
                <div className="city-rows">
                  {[...listed.slice(0, 50), ...listed.slice(50).filter((c) => c.mine)].map((c) => {
                    const key = statKey(c);
                    const n = m.value(c);
                    return (
                      <button key={key} className={`city-row flagged p${place.get(key)} ${c.mine ? 'me' : ''} ${selected?.kind === 'city' && key === selected.key ? 'sel' : ''}`} onClick={() => pickCity(c)}>
                        <span className="place">{place.get(key)}</span>
                        <span className="flag">{c.country ? flag(c.country) : ''}</span>
                        <span className="who">
                          <b>{cityName(c.city)}</b>
                          <small>{knownCity(c.city) ? m.long(n) : t('{0} · не на глобусе', { 0: m.long(n) })}</small>
                        </span>
                        <span className="reps">{metric === 'reps' ? compact(n) : n}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
