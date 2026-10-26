import { useEffect, useState } from 'react';
import { City } from '../icons';
import { Sheet } from '../Sheet';
import { type CityBoard, cityApi, NotSignedIn } from './api';
import '../game/holiday.css';

// Топ по городу: повторы за эту неделю (с понедельника по Москве). Свой город, место в нём и рейтинг городов.

const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('ru', { day: 'numeric', month: 'long' });
const word = (n: number, forms: [string, string, string]) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return forms[m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 1 : 2];
};

export function CitySheet({ onClose }: { onClose: () => void }) {
  const [board, setBoard] = useState<CityBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guest, setGuest] = useState(false);
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState('');
  const [tab, setTab] = useState<'city' | 'cities'>('city');
  const [busy, setBusy] = useState(false);

  const run = (p: Promise<CityBoard>) => {
    setBusy(true);
    p.then((b) => {
      setBoard(b);
      setError(null);
      setEdit(!b.city);
      setText(b.city ?? b.suggest ?? '');
    })
      .catch((e) => (e instanceof NotSignedIn ? setGuest(true) : setError((e as Error).message)))
      .finally(() => setBusy(false));
  };
  useEffect(() => run(cityApi.board()), []);

  const save = () => text.trim() && run(cityApi.set(text.trim()));

  return (
    <Sheet onClose={onClose} bodyClassName="hol-sheet">
      <div className="level-title">
        <City size={20} /> Топ города
      </div>
      {board && (
        <div className="muted">
          Повторы за неделю: {fmtDay(board.from)} – {fmtDay(board.to)}. В понедельник всё начинается заново.
        </div>
      )}
      {guest && <div className="city-empty">Топ города — для тех, кто вошёл через Telegram, Max или Яндекс. Войди в настройках, и твои повторы попадут в рейтинг.</div>}
      {!board && !guest && !error && <div className="city-empty">Загружаем…</div>}
      {error && <div className="error">{error}</div>}

      {board && edit && (
        <>
          <div className="section-title">{board.city ? 'Сменить город' : 'Где ты тренируешься?'}</div>
          <div className="city-form">
            <input value={text} maxLength={30} placeholder="Москва" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
            <button className="small-btn" disabled={busy || !text.trim()} onClick={save}>
              Готово
            </button>
          </div>
          {(board.suggest || board.cities.length > 0) && (
            <div className="city-suggest">
              {[board.suggest, ...board.cities.map((c) => c.city)]
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
              Убрать меня из топа городов
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
                ? `${board.me.place}-е место из ${board.me.players} · ${board.me.reps.toLocaleString('ru')} ${word(board.me.reps, ['повтор', 'повтора', 'повторов'])} за неделю`
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
              Города
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
                    <span className="reps">{r.reps.toLocaleString('ru')}</span>
                  </div>
                ))}
              </div>
            )
          ) : board.cities.length === 0 ? (
            <div className="city-empty">На этой неделе ещё ни один город не тренировался.</div>
          ) : (
            <div className="city-rows">
              {board.cities.map((c, i) => (
                <div key={c.city} className={`city-row p${i + 1} ${c.mine ? 'me' : ''}`}>
                  <span className="place">{i + 1}</span>
                  <span className="who">
                    <b>{c.city}</b>
                    <small>
                      {c.players} {word(c.players, ['герой', 'героя', 'героев'])}
                    </small>
                  </span>
                  <span className="reps">{c.reps.toLocaleString('ru')}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
