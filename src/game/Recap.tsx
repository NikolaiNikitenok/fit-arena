import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { post } from '../cloud';
import { BOT_USERNAME, platform, share, tg, userName } from '../telegram';
import { track } from '../telemetry';
import { amountLabel, exerciseLabel, MONTHS, MONTHS_IN, MONTHS_OF, monthRecap, RECAP_TYPES, recapWord, type Recap } from './recap';
import { drawRecapCard, recapJpeg } from './recapCard';
import type { Progress } from './progress';
import { EX_COLOR } from './Stats';
import './recap.css';
import { locale, t } from '../i18n';
import { cityName } from '../city/cityName';

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
    const tick = (tm: number) => {
      const p = Math.min(1, (tm - t0) / ms);
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
  const name = userName() === t('Гость') ? t('Герой') : userName();

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
            {t('Твой')}
            <br />
            {MONTHS[r.m]}
          </div>
          <div className="rc-text rc-late">{t('Посмотрим, каким он был? Касайся экрана, чтобы листать.')}</div>
        </>
      ),
    },
    {
      id: 'total',
      tone: 'fire',
      body: (on) => (
        <>
          <div className="rc-kicker">{t('За {0} ты сделал', { 0: MONTHS[r.m] })}</div>
          <Big n={r.total} on={on} />
          <div className="rc-sub">{recapWord(r.total, [t('повтор'), t('повтора'), t('повторов')])}</div>
          {r.growth != null && r.growth !== 0 && (
            <div className={`rc-chip ${r.growth > 0 ? 'up' : 'down'} rc-late`}>
              {r.growth > 0 ? t('▲ на {0}% больше', { 0: r.growth }) : t('▼ на {0}% меньше', { 0: -r.growth })}{t(', чем в {0}', { 0: MONTHS_IN[(r.m + 11) % 12] })}
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
          <div className="rc-kicker">{t('Дни силы')}</div>
          <div className="rc-title">
            {t('{0} {1} из {2}', { 0: r.days, 1: recapWord(r.days, [t('день'), t('дня'), t('дней')]), 2: r.daysInMonth })}
          </div>
          <div className="rc-cal">
            {[t('пн'), t('вт'), t('ср'), t('чт'), t('пт'), t('сб'), t('вс')].map((d) => (
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
            {r.streak > 1 ? t('Лучшая серия — {0} {1} подряд.', { 0: r.streak, 1: recapWord(r.streak, [t('день'), t('дня'), t('дней')]) }) : t('Следующая цель — серия из нескольких дней подряд.')}
            {r.favWeekday ? t(' Чаще всего ты тренировался {0}.', { 0: r.favWeekday }) : ''}
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
                <div className="rc-kicker">{t('Твоё главное упражнение')}</div>
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
                <div className="rc-kicker">{t('Твой день силы')}</div>
                <div className="rc-title">
                  {r.bestDay!.weekday[0].toUpperCase() + r.bestDay!.weekday.slice(1)}, {fmtDate(r.bestDay!.date)}
                </div>
                <Big n={r.bestDay!.reps} on={on} />
                <div className="rc-sub">{t('{0} за день', { 0: recapWord(r.bestDay!.reps, [t('повтор'), t('повтора'), t('повторов')]) })}</div>
                {Object.keys(r.best).length > 0 && (
                  <div className="rc-text rc-late">
                    {t('Лучшие подходы:{0}', { 0: ' ' })}
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
          <div className="rc-kicker">{t('Твой тип героя {0}', { 0: MONTHS_OF[r.m] })}</div>
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
          <div className="rc-preview">{card ? <img src={card.url} alt={t('Итоги {0}', { 0: MONTHS_OF[r.m] })} /> : <div className="rc-wait">{t('Рисую картинку…')}</div>}</div>
          {note && <div className="rc-note">{note}</div>}
          <div className="rc-actions" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            {platform === 'tg' && tg?.shareToStory && (
              <button className="primary" disabled={!card || busy} onClick={toStory}>
                {t('В сторис Telegram')}
              </button>
            )}
            <button className={platform === 'tg' && tg?.shareToStory ? 'secondary' : 'primary'} disabled={!card || busy} onClick={shareFile}>
              {t('Поделиться картинкой')}
            </button>
            <button className="secondary" onClick={sendFriend}>
              {t('Позвать друга')}
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
    const tm = setTimeout(
      () => {
        drawRecapCard(r, { name, percent: standing?.percent ?? null, city: standing?.city ?? null })
          .then(recapJpeg)
          .then((blob) => {
            url = URL.createObjectURL(blob);
            storyUrl.current = null;
            setCard({ blob, url });
          })
          .catch(() => setNote(t('Не получилось нарисовать картинку')));
      },
      standing ? 0 : 2500,
    );
    return () => {
      clearTimeout(tm);
      if (url) URL.revokeObjectURL(url);
    };
  }, [r, standing, name]);

  // Слайды листаются сами; на последнем — стоим.
  useEffect(() => {
    if (paused || at >= last) return;
    const tm = setTimeout(() => go(at + 1), SLIDE_MS);
    return () => clearTimeout(tm);
    // go читает свежий список слайдов.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, paused, last]);

  const text = t('Мои итоги {0} в NikitenokArena: {1} {2}, тип героя — «{3}» {4}', { 0: MONTHS_OF[r.m], 1: r.total.toLocaleString(locale()), 2: recapWord(r.total, [t('повтор'), t('повтора'), t('повторов')]), 3: type.name, 4: type.emoji });

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
      tg!.shareToStory!(url, { text: text.slice(0, 200), widget_link: { url: LINK, name: t('Играть') } });
      track('recap_share', 'story');
    } catch {
      setNote(t('Не получилось открыть сторис. Попробуй «Поделиться картинкой».'));
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
    setNote(t('Картинка сохранена. Если не скачалась — зажми её и выбери «Сохранить».'));
  }

  async function sendFriend() {
    track('recap_share', 'friend');
    const res = await share(LINK, t('{0}. Сможешь больше?', { 0: text })).catch(() => null);
    if (res === 'copied') setNote(t('Ссылка скопирована'));
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
        aria-label={t('Закрыть')}
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
          {t('↺ Сначала')}
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
          <div className="rc-kicker">{t('Среди {0} героев месяца', { 0: s.players.toLocaleString(locale()) })}</div>
          <div className="rc-title">{t('ты сильнее')}</div>
          <div className="rc-big">{p}%</div>
        </>
      )}
      {s.city ? (
        <div className="rc-city rc-late">
          <b>{cityName(s.city.name)}</b> {t('— {0}-е место из {1} {2}', { 0: s.city.place, 1: s.city.cities, 2: recapWord(s.city.cities, [t('города'), t('городов'), t('городов')]) })}
          {s.city.me > 0 && (
            <>
              <br />
              {t('ты — {0}-й из {1} в своём городе', { 0: s.city.me, 1: s.city.members })}
            </>
          )}
        </div>
      ) : (
        <div className="rc-text rc-late">{t('Выбери свой город в «Битве городов» — в следующий раз увидишь его место.')}</div>
      )}
    </>
  );
}
