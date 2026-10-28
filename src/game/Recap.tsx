import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { post } from '../cloud';
import { BOT_USERNAME, platform, share, tg, userName } from '../telegram';
import { track } from '../telemetry';
import { amountLabel, exerciseLabel, MONTHS, MONTHS_IN, MONTHS_OF, monthRecap, RECAP_TYPES, recapWord, type Recap } from './recap';
import { drawRecapCard, recapJpeg } from './recapCard';
import type { Progress } from './progress';
import { EX_COLOR } from './Stats';
import './recap.css';
import { locale } from '../i18n';

// Итоги месяца, как Spotify Wrapped: слайды листаются касанием (слева — назад) и сами через несколько секунд.
// Последний слайд — картинка для сторис: в Telegram она уходит в сторис, в остальных местах — в «Поделиться».

interface Standing {
  percent: number | null;
  players: number;
  city: { name: string; place: number; cities: number; me: number; members: number } | null;
}

const SLIDE_MS = 6500;
const LINK = `https://t.me/${BOT_USERNAME}?startapp=src-recap`;

/** Число набегает от нуля. */
function useCount(target: number, on: boolean, ms = 1400): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!on) return setV(0);
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, on, ms]);
  return v;
}

const fmtDate = (d: string) => `${Number(d.slice(8))} ${MONTHS_OF[Number(d.slice(5, 7)) - 1]}`;

function Big({ n, on }: { n: number; on: boolean }) {
  return <div className="rc-big">{useCount(n, on).toLocaleString(locale())}</div>;
}

const blobBase64 = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

export function RecapScreen({ progress, month, onClose }: { progress: Progress; month: string; onClose: () => void }) {
  const r = useMemo(() => monthRecap(progress, month), [progress, month]);
  const [standing, setStanding] = useState<Standing | null>(null);
  // Текущий слайд — по id: слайд с местом приходит позже и встаёт в середину списка.
  const [cur, setCur] = useState('intro');
  const [paused, setPaused] = useState(false);
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const storyUrl = useRef<string | null>(null);
  const name = userName() === 'Гость' ? 'Герой' : userName();

  useEffect(() => {
    track('recap_open', month);
    post('/api/recap', { month })
      .then((s) => setStanding(s as Standing))
      .catch(() => null);
  }, [month]);

  const type = RECAP_TYPES[r.type];
  const slides: { id: string; tone: string; body: (on: boolean) => ReactNode }[] = [
    {
      id: 'intro',
      tone: 'sunset',
      body: () => (
        <>
          <div className="rc-kicker">NikitenokArena · {r.year}</div>
          <div className="rc-title rc-pop">
            Твой
            <br />
            {MONTHS[r.m]}
          </div>
          <div className="rc-text rc-late">Посмотрим, каким он был? Касайся экрана, чтобы листать.</div>
        </>
      ),
    },
    {
      id: 'total',
      tone: 'fire',
      body: (on) => (
        <>
          <div className="rc-kicker">За {MONTHS[r.m]} ты сделал</div>
          <Big n={r.total} on={on} />
          <div className="rc-sub">{recapWord(r.total, ['повтор', 'повтора', 'повторов'])}</div>
          {r.growth != null && r.growth !== 0 && (
            <div className={`rc-chip ${r.growth > 0 ? 'up' : 'down'} rc-late`}>
              {r.growth > 0 ? `▲ на ${r.growth}% больше` : `▼ на ${-r.growth}% меньше`}, чем в {MONTHS_IN[(r.m + 11) % 12]}
            </div>
          )}
          {r.facts[0] && <div className="rc-text rc-late">{r.facts[0]}</div>}
        </>
      ),
    },
    {
      id: 'days',
      tone: 'night',
      body: () => (
        <>
          <div className="rc-kicker">Дни силы</div>
          <div className="rc-title">
            {r.days} {recapWord(r.days, ['день', 'дня', 'дней'])} из {r.daysInMonth}
          </div>
          <div className="rc-cal">
            {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((d) => (
              <span key={d} className="wd">
                {d}
              </span>
            ))}
            {Array.from({ length: r.firstWeekday }, (_, k) => (
              <span key={`e${k}`} />
            ))}
            {r.grid.map((n, k) => (
              <span key={k} className={n ? 'on' : ''} style={{ animationDelay: `${0.15 + k * 0.03}s` }}>
                {k + 1}
              </span>
            ))}
          </div>
          <div className="rc-text rc-late">
            {r.streak > 1 ? `Лучшая серия — ${r.streak} ${recapWord(r.streak, ['день', 'дня', 'дней'])} подряд.` : 'Следующая цель — серия из нескольких дней подряд.'}
            {r.favWeekday ? ` Чаще всего ты тренировался ${r.favWeekday}.` : ''}
          </div>
        </>
      ),
    },
    ...(r.byEx.length
      ? [
          {
            id: 'ex',
            tone: 'ocean',
            body: () => (
              <>
                <div className="rc-kicker">Твоё главное упражнение</div>
                <div className="rc-title">{exerciseLabel(r.byEx[0].ex)}</div>
                <div className="rc-bars">
                  {r.byEx.map((e, k) => (
                    <div key={e.ex} className="rc-bar" style={{ animationDelay: `${0.2 + k * 0.15}s` }}>
                      <div className="rc-bar-top">
                        <b>{amountLabel(e.ex, e.amount)}</b>
                        <span>{Math.round(e.share * 100)}%</span>
                      </div>
                      <div className="rc-bar-track">
                        <div style={{ width: `${Math.max(4, e.share * 100)}%`, background: EX_COLOR[e.ex], animationDelay: `${0.35 + k * 0.15}s` }} />
                      </div>
                    </div>
                  ))}
                </div>
                {r.facts.slice(1).map((f) => (
                  <div key={f} className="rc-text rc-late">
                    {f}
                  </div>
                ))}
              </>
            ),
          },
        ]
      : []),
    ...(r.bestDay
      ? [
          {
            id: 'best',
            tone: 'gold',
            body: (on: boolean) => (
              <>
                <div className="rc-kicker">Твой день силы</div>
                <div className="rc-title">
                  {r.bestDay!.weekday[0].toUpperCase() + r.bestDay!.weekday.slice(1)}, {fmtDate(r.bestDay!.date)}
                </div>
                <Big n={r.bestDay!.reps} on={on} />
                <div className="rc-sub">{recapWord(r.bestDay!.reps, ['повтор', 'повтора', 'повторов'])} за день</div>
                {Object.keys(r.best).length > 0 && (
                  <div className="rc-text rc-late">
                    Лучшие подходы:{' '}
                    {r.byEx
                      .filter((e) => r.best[e.ex])
                      .map((e) => amountLabel(e.ex, r.best[e.ex]!))
                      .join(', ')}
                  </div>
                )}
              </>
            ),
          },
        ]
      : []),
    ...(standing && (standing.percent != null || standing.city)
      ? [
          {
            id: 'rank',
            tone: 'violet',
            body: (on: boolean) => (
              <RankSlide s={standing} on={on} />
            ),
          },
        ]
      : []),
    {
      id: 'type',
      tone: 'sunset',
      body: () => (
        <>
          <div className="rc-kicker">Твой тип героя {MONTHS_OF[r.m]}</div>
          <div className="rc-emoji rc-pop">{type.emoji}</div>
          <div className="rc-title">{type.name}</div>
          <div className="rc-text rc-late">{type.text}</div>
        </>
      ),
    },
    {
      id: 'card',
      tone: 'night',
      body: () => (
        <>
          <div className="rc-preview">{card ? <img src={card.url} alt={`Итоги ${MONTHS_OF[r.m]}`} /> : <div className="rc-wait">Рисую картинку…</div>}</div>
          {note && <div className="rc-note">{note}</div>}
          <div className="rc-actions" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            {platform === 'tg' && tg?.shareToStory && (
              <button className="primary" disabled={!card || busy} onClick={toStory}>
                В сторис Telegram
              </button>
            )}
            <button className={platform === 'tg' && tg?.shareToStory ? 'secondary' : 'primary'} disabled={!card || busy} onClick={shareFile}>
              Поделиться картинкой
            </button>
            <button className="secondary" onClick={sendFriend}>
              Позвать друга
            </button>
          </div>
        </>
      ),
    },
  ];
  const last = slides.length - 1;
  const at = Math.max(0, slides.findIndex((s) => s.id === cur));
  const go = (k: number) => setCur(slides[Math.min(last, Math.max(0, k))].id);

  // Картинку рисуем заранее, как только узнали место (или поняли, что сервер не ответит).
  useEffect(() => {
    let url = '';
    const t = setTimeout(
      () => {
        drawRecapCard(r, { name, percent: standing?.percent ?? null, city: standing?.city ?? null })
          .then(recapJpeg)
          .then((blob) => {
            url = URL.createObjectURL(blob);
            storyUrl.current = null;
            setCard({ blob, url });
          })
          .catch(() => setNote('Не получилось нарисовать картинку'));
      },
      standing ? 0 : 2500,
    );
    return () => {
      clearTimeout(t);
      if (url) URL.revokeObjectURL(url);
    };
  }, [r, standing, name]);

  // Слайды листаются сами; на последнем — стоим.
  useEffect(() => {
    if (paused || at >= last) return;
    const t = setTimeout(() => go(at + 1), SLIDE_MS);
    return () => clearTimeout(t);
    // go читает свежий список слайдов.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, paused, last]);

  const text = `Мои итоги ${MONTHS_OF[r.m]} в NikitenokArena: ${r.total.toLocaleString(locale())} ${recapWord(r.total, ['повтор', 'повтора', 'повторов'])}, тип героя — «${type.name}» ${type.emoji}`;

  const upload = async (): Promise<string> => {
    if (storyUrl.current) return storyUrl.current;
    const res = (await post('/api/story-image', { image: await blobBase64(card!.blob) })) as { url: string };
    return (storyUrl.current = res.url);
  };

  async function toStory() {
    if (!card) return;
    setBusy(true);
    setNote(null);
    try {
      const url = await upload();
      tg!.shareToStory!(url, { text: text.slice(0, 200), widget_link: { url: LINK, name: 'Играть' } });
      track('recap_share', 'story');
    } catch {
      setNote('Не получилось открыть сторис. Попробуй «Поделиться картинкой».');
    } finally {
      setBusy(false);
    }
  }

  async function shareFile() {
    if (!card) return;
    const file = new File([card.blob], `itogi-${month}.jpg`, { type: 'image/jpeg' });
    track('recap_share', 'file');
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: `${text} ${LINK}` });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    // В Telegram скачать можно только по ссылке: загружаем картинку на сервер.
    if (tg?.downloadFile && tg.initData) {
      try {
        tg.downloadFile({ url: await upload(), file_name: file.name });
        return;
      } catch {
        // Ниже — обычное скачивание.
      }
    }
    const a = document.createElement('a');
    a.href = card.url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setNote('Картинка сохранена. Если не скачалась — зажми её и выбери «Сохранить».');
  }

  async function sendFriend() {
    track('recap_share', 'friend');
    const res = await share(LINK, `${text}. Сможешь больше?`).catch(() => null);
    if (res === 'copied') setNote('Ссылка скопирована');
  }

  const tap = (e: React.MouseEvent) => {
    if (at === last) return;
    const left = e.clientX < window.innerWidth / 3;
    go(left ? at - 1 : at + 1);
  };

  return (
    <div className={`recap tone-${slides[at].tone}`} onClick={tap} onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerCancel={() => setPaused(false)}>
      <div className="rc-bars-top">
        {slides.map((s, k) => (
          <span key={s.id} className={k < at ? 'done' : k === at ? 'now' : ''}>
            <i style={k === at && at < last ? { animationDuration: `${SLIDE_MS}ms`, animationPlayState: paused ? 'paused' : 'running' } : undefined} />
          </span>
        ))}
      </div>
      <button
        className="rc-x"
        aria-label="Закрыть"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ×
      </button>
      {at === last && (
        <button
          className="rc-back"
          onClick={(e) => {
            e.stopPropagation();
            go(0);
          }}
        >
          ↺ Сначала
        </button>
      )}
      <div className="rc-slide" key={slides[at].id}>
        {slides[at].body(true)}
      </div>
    </div>
  );
}

function RankSlide({ s, on }: { s: Standing; on: boolean }) {
  const p = useCount(s.percent ?? 0, on);
  return (
    <>
      {s.percent != null && (
        <>
          <div className="rc-kicker">Среди {s.players.toLocaleString(locale())} героев месяца</div>
          <div className="rc-title">ты сильнее</div>
          <div className="rc-big">{p}%</div>
        </>
      )}
      {s.city ? (
        <div className="rc-city rc-late">
          <b>{s.city.name}</b> — {s.city.place}-е место из {s.city.cities} {recapWord(s.city.cities, ['города', 'городов', 'городов'])}
          {s.city.me > 0 && (
            <>
              <br />
              ты — {s.city.me}-й из {s.city.members} в своём городе
            </>
          )}
        </div>
      ) : (
        <div className="rc-text rc-late">Выбери свой город в «Битве городов» — в следующий раз увидишь его место.</div>
      )}
    </>
  );
}
