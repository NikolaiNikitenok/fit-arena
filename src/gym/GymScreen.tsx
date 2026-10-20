import { useEffect, useMemo, useState } from 'react';
import { Check, Cross, Dumbbell, Medal, Pencil, Plus, Search, Timer, Trash } from '../icons';
import { sfx } from '../audio';
import { reportGym } from '../family';
import { Remark } from '../game/Dialog';
import type { Line } from '../game/levels';
import { NPCS } from '../game/npcs';
import { dayKey, type Progress } from '../game/progress';
import { hapticRep, tg } from '../telegram';
import { customId, GYM_EXERCISES, gymExercise, type Muscle, MUSCLES, searchGym } from './catalog';
import {
  bestOf,
  cancelRun,
  deleteTemplate,
  doneSets,
  durationText,
  finishRun,
  freshSets,
  type GymRun,
  type GymSession,
  type GymSet,
  gymDays,
  gymOf,
  type GymTemplate,
  kgText,
  minutesOf,
  type PlanItem,
  runVolume,
  saveTemplate,
  setsWord,
  setWeekDay,
  STARTERS,
  startRun,
  todayTemplate,
  updateRun,
  weekday,
  WEEKDAYS,
} from './gym';
import { ExIcon } from './GymIcons';
import './gym.css';

// Дневник зала: план недели, свои тренировки, запись подходов и итог. На серию, задание дня и рейтинг не влияет.

const grom = (text: string): Line => ({ who: NPCS.grom.name, face: 'grom', color: NPCS.grom.color, text });

type View =
  | { kind: 'home' }
  | { kind: 'edit'; tpl: GymTemplate | null }
  | { kind: 'summary'; session: GymSession; fresh?: boolean };

interface Props {
  progress: Progress;
  update: (fn: (p: Progress) => Progress) => void;
  onClose: () => void;
}

export function GymScreen({ progress, update, onClose }: Props) {
  const g = gymOf(progress);
  const [view, setView] = useState<View>({ kind: 'home' });

  if (g.run) {
    return (
      <RunView
        run={g.run}
        progress={progress}
        update={update}
        onFinish={() => {
          let res: ReturnType<typeof finishRun> = null;
          update((p) => {
            res = finishRun(p, Date.now());
            return res?.progress ?? p;
          });
          const r = res as ReturnType<typeof finishRun>;
          if (!r || !r.session.items.length) return setView({ kind: 'home' });
          sfx(r.session.prs.length ? 'chest' : 'win');
          const s = r.session;
          reportGym({
            id: s.id,
            title: s.name,
            minutes: minutesOf(s),
            volume_kg: s.vol,
            records: s.prs.length,
            exercises: s.items.map((i) => ({ name: gymExercise(i.ex).name, sets: i.sets.length })),
          });
          setView({ kind: 'summary', session: s, fresh: true });
        }}
      />
    );
  }

  if (view.kind === 'edit') return <TemplateEditor tpl={view.tpl} progress={progress} update={update} onDone={() => setView({ kind: 'home' })} />;

  if (view.kind === 'summary')
    return (
      <div className="gym-screen">
        <div className="app-head">
          <button className="pill btn" onClick={() => setView({ kind: 'home' })}>
            ‹ Назад
          </button>
          <h1>{view.fresh ? 'Итог' : 'Тренировка'}</h1>
          <span />
        </div>
        <SessionCard s={view.session} open />
        {view.fresh && (
          <Remark
            line={grom(
              view.session.prs.length
                ? `Новых рекордов: ${view.session.prs.length}. Вот это я понимаю — железо уступает!`
                : 'Записал. Регулярность важнее рекордов, боец: в следующий раз добавим немного веса.',
            )}
          />
        )}
        {view.fresh && tg?.initData && <div className="muted gym-note">Отметка «тренировка сделана» ушла в NikitenokFamily, раздел «Спорт».</div>}
        <button className="primary" onClick={() => setView({ kind: 'home' })}>
          Готово
        </button>
      </div>
    );

  return <Home progress={progress} update={update} onClose={onClose} setView={setView} />;
}

function Home({ progress, update, onClose, setView }: Props & { setView: (v: View) => void }) {
  const g = gymOf(progress);
  const now = Date.now();
  const today = todayTemplate(g, now);
  const done = gymDays(g);
  const [dayPick, setDayPick] = useState<number | null>(null);
  // Даты текущей недели с понедельника: отметить, в какие дни уже был в зале.
  const monday = now - weekday(now) * 86400_000;
  const [showAll, setShowAll] = useState(false);
  const history = showAll ? g.history : g.history.slice(0, 5);
  const volWeek = g.history.filter((s) => s.start >= new Date(dayKey(monday) + 'T00:00:00').getTime()).reduce((a, s) => a + s.vol, 0);

  return (
    <div className="gym-screen">
      <div className="app-head">
        <button className="pill btn" onClick={onClose}>
          ‹ Назад
        </button>
        <h1>Дневник зала</h1>
        <span />
      </div>
      <Remark
        line={grom(
          g.templates.length
            ? today
              ? `Сегодня у нас «${today.name}». Записывай каждый подход — так видно, как ты растёшь.`
              : 'Сегодня по плану отдых. Но если тянет в зал — начни свободную тренировку.'
            : 'В зале тоже нужен план. Собери свои тренировки, расставь по дням недели — а я буду держать счёт весам. На серию и рейтинг это не влияет, это для тебя.',
        )}
      />

      <div className="gym-week">
        {WEEKDAYS.map((d, i) => {
          const tpl = g.templates.find((t) => t.id === g.week[i]);
          const date = dayKey(monday + i * 86400_000);
          return (
            <button key={d} className={`gym-day ${i === weekday(now) ? 'today' : ''} ${tpl ? 'plan' : ''} ${done.has(date) ? 'done' : ''}`} onClick={() => setDayPick(i)}>
              <span className="gym-day-name">{d}</span>
              <span className="gym-day-mark">{done.has(date) ? <Check size={14} /> : tpl ? <Dumbbell size={14} /> : '·'}</span>
              <span className="gym-day-tpl">{tpl ? tpl.name : 'отдых'}</span>
            </button>
          );
        })}
      </div>
      {volWeek > 0 && <div className="muted gym-note">За эту неделю поднято {kgText(volWeek)}</div>}

      {today ? (
        <button className="primary daily" onClick={() => update((p) => startRun(p, Date.now(), today))}>
          Начать: {today.name}
          <small>
            {today.items.length} упр. · {today.items.reduce((a, i) => a + i.sets, 0)} подходов
          </small>
        </button>
      ) : null}
      <button className={today ? 'secondary' : 'primary'} onClick={() => update((p) => startRun(p, Date.now()))}>
        Свободная тренировка
      </button>

      <div className="section-title">
        Мои тренировки
        <button className="link" onClick={() => setView({ kind: 'edit', tpl: null })}>
          <Plus size={14} /> Новая
        </button>
      </div>
      {g.templates.map((t) => (
        <div key={t.id} className="gym-tpl">
          <button className="gym-tpl-main" onClick={() => setView({ kind: 'edit', tpl: t })}>
            <b>{t.name}</b>
            <small>
              {daysOf(g.week, t.id) || 'не в плане'} · {t.items.map((i) => gymExercise(i.ex).name.replace(/ \(.*\)$/, '')).slice(0, 3).join(', ')}
              {t.items.length > 3 ? '…' : ''}
            </small>
          </button>
          <button className="small-btn" onClick={() => update((p) => startRun(p, Date.now(), t))}>
            Начать
          </button>
        </div>
      ))}
      {g.templates.length < 3 && (
        <div className="gym-starters">
          <div className="muted">Готовые для начала:</div>
          <div className="gym-chips">
            {STARTERS.filter((s) => !g.templates.some((t) => t.name === s.name)).map((s) => (
              <button key={s.name} className="swap-chip" onClick={() => update((p) => saveTemplate(p, s))}>
                <Plus size={13} /> {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!!g.history.length && <div className="section-title">История</div>}
      {history.map((s) => (
        <button key={s.id} className="gym-hist" onClick={() => setView({ kind: 'summary', session: s })}>
          <SessionCard s={s} />
        </button>
      ))}
      {g.history.length > 5 && !showAll && (
        <button className="link" onClick={() => setShowAll(true)}>
          Показать все ({g.history.length})
        </button>
      )}

      {dayPick !== null && (
        <div className="sheet" onClick={() => setDayPick(null)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">{['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'][dayPick]}</div>
            <div className="gym-pick-list">
              {[null, ...g.templates].map((t) => (
                <button
                  key={t?.id ?? 'rest'}
                  className={`gym-pick ${g.week[dayPick] === (t?.id ?? null) ? 'on' : ''}`}
                  onClick={() => {
                    update((p) => setWeekDay(p, dayPick, t?.id ?? null));
                    setDayPick(null);
                  }}
                >
                  {t ? t.name : 'Отдых'}
                  {g.week[dayPick] === (t?.id ?? null) && <Check size={16} />}
                </button>
              ))}
            </div>
            {!g.templates.length && <div className="muted">Сначала создай тренировку или добавь готовую.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

const daysOf = (week: (string | null)[], id: string) =>
  week
    .map((w, i) => (w === id ? WEEKDAYS[i] : null))
    .filter(Boolean)
    .join(', ');

const dateText = (t: number) => {
  const d = new Date(t);
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const today = dayKey(Date.now());
  const k = dayKey(t);
  if (k === today) return `сегодня в ${time}`;
  if (k === dayKey(Date.now() - 86400_000)) return `вчера в ${time}`;
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} в ${time}`;
};

/** Итог тренировки: время, объём, рекорды и упражнения — как пост в ленте, но в стиле игры. */
export function SessionCard({ s, open = false }: { s: GymSession; open?: boolean }) {
  const [more, setMore] = useState(open);
  const shown = more ? s.items : s.items.slice(0, 3);
  return (
    <div className="gym-card">
      <div className="gym-card-head">
        <span className="gym-card-title">{s.name}</span>
        <span className="gym-card-date">{dateText(s.start)}</span>
      </div>
      <div className="gym-stats">
        <div>
          <span>Время</span>
          <b>{durationText(minutesOf(s))}</b>
        </div>
        <div>
          <span>Объём</span>
          <b>{kgText(s.vol)}</b>
        </div>
        <div>
          <span>Рекорды</span>
          <b className="gym-prs">
            <Medal size={20} /> {s.prs.length}
          </b>
        </div>
      </div>
      <div className="gym-ex-list">
        {shown.map((it) => {
          const ex = gymExercise(it.ex);
          return (
            <div key={it.ex} className="gym-ex-row">
              <ExIcon ex={ex} size={38} />
              <span className="gym-ex-text">
                <span>
                  {it.sets.length} {setsWord(it.sets.length)} {ex.name}
                </span>
                {open && <small>{it.sets.map((x) => setText(ex.kind, x)).join(' · ')}</small>}
              </span>
              {s.prs.includes(it.ex) && <Medal size={18} />}
            </div>
          );
        })}
      </div>
      {!more && s.items.length > 3 && (
        <span
          className="gym-more"
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            setMore(true);
          }}
        >
          Показать ещё {s.items.length - 3} упр.
        </span>
      )}
    </div>
  );
}

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
function setText(kind: ReturnType<typeof gymExercise>['kind'], [a, b]: [number, number]): string {
  if (kind === 't') return `${b} с`;
  if (kind === 'c') return a ? `${b} мин, ${fmt(a)} км` : `${b} мин`;
  if (kind === 'bw') return a ? `+${fmt(a)}×${b}` : `${b}`;
  return `${fmt(a)}×${b}`;
}

/** Числовое поле: держит набранный текст («62,») и отдаёт число, когда оно разбирается. */
function NumInput({ value, onChange, placeholder, step = 1 }: { value?: number; onChange: (v: number | undefined) => void; placeholder?: string; step?: number }) {
  const [text, setText] = useState(value === undefined ? '' : fmt(value));
  useEffect(() => {
    const parsed = Number(text.replace(',', '.'));
    if (value !== (text === '' ? undefined : parsed)) setText(value === undefined ? '' : fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className="gym-num"
      inputMode={step < 1 ? 'decimal' : 'numeric'}
      placeholder={placeholder}
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,]/g, '').slice(0, 7);
        setText(t);
        if (t === '') return onChange(undefined);
        const n = Number(t.replace(',', '.'));
        if (Number.isFinite(n)) onChange(Math.min(9999, n));
      }}
    />
  );
}

const REST_DEFAULT = 90;

function RunView({ run, progress, update, onFinish }: { run: GymRun; progress: Progress; update: Props['update']; onFinish: () => void }) {
  const g = gymOf(progress);
  const [now, setNow] = useState(Date.now());
  const [picker, setPicker] = useState(false);
  const [confirm, setConfirm] = useState<'cancel' | 'finish' | null>(null);
  // Отдых после отмеченного подхода: до какого момента.
  const [restEnd, setRestEnd] = useState<number | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const restLeft = restEnd ? Math.ceil((restEnd - now) / 1000) : 0;
  useEffect(() => {
    if (restEnd && restLeft <= 0) {
      setRestEnd(null);
      sfx('beep');
      hapticRep();
    }
  }, [restEnd, restLeft]);

  const edit = (fn: (r: GymRun) => GymRun) => update((p) => updateRun(p, fn));
  const setSet = (ei: number, si: number, patch: Partial<GymSet>) =>
    edit((r) => ({ ...r, items: r.items.map((it, i) => (i !== ei ? it : { ...it, sets: it.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) })) }));
  const vol = runVolume(run);
  const doneCount = run.items.reduce((a, it) => a + doneSets(it).length, 0);
  const elapsed = Math.max(0, Math.floor((now - run.start) / 1000));

  if (picker)
    return (
      <Picker
        onClose={() => setPicker(false)}
        onPick={(ids) => {
          edit((r) => ({ ...r, items: [...r.items, ...ids.map((ex) => ({ ex, sets: freshSets(g, ex) }))] }));
          setPicker(false);
        }}
      />
    );

  return (
    <div className="gym-screen gym-run">
      <div className="gym-run-head">
        <div>
          <div className="gym-run-name">{run.name}</div>
          <div className="gym-run-meta">
            <span>
              <Timer size={14} /> {clock(elapsed)}
            </span>
            <span>{kgText(vol)}</span>
            <span>
              {doneCount} {setsWord(doneCount)}
            </span>
          </div>
        </div>
        <button className="small-btn" onClick={() => setConfirm('finish')}>
          Готово
        </button>
      </div>

      {!run.items.length && <div className="muted gym-note">Добавь первое упражнение — и поехали.</div>}

      {run.items.map((it, ei) => {
        const ex = gymExercise(it.ex);
        const prev = g.best[it.ex];
        const last = g.last[it.ex];
        const nowBest = bestOf(ex.kind, doneSets(it));
        const pr = prev && ((nowBest.w ?? 0) > (prev.w ?? Infinity) || (nowBest.e ?? 0) > (prev.e ?? Infinity) || (nowBest.r ?? 0) > (prev.r ?? Infinity) || (nowBest.t ?? 0) > (prev.t ?? Infinity));
        return (
          <div key={`${it.ex}-${ei}`} className="gym-run-ex">
            <div className="gym-run-ex-head">
              <ExIcon ex={ex} size={36} />
              <span className="gym-ex-text">
                <b>{ex.name}</b>
                <small>
                  {last ? `Прошлый раз: ${last.map((s) => setText(ex.kind, [s.w || s.d || 0, s.r || s.t || 0])).join(' · ')}` : 'Первый раз — подбери рабочий вес'}
                </small>
              </span>
              {pr && (
                <span className="gym-pr-chip">
                  <Medal size={15} /> рекорд
                </span>
              )}
              <button className="gym-x" aria-label="Убрать" onClick={() => edit((r) => ({ ...r, items: r.items.filter((_, i) => i !== ei) }))}>
                <Trash size={15} />
              </button>
            </div>
            <div className={`gym-sets k-${ex.kind}`}>
              <div className="gym-set head">
                <span>№</span>
                {ex.kind === 'w' && <span>кг</span>}
                {ex.kind === 'bw' && <span>+кг</span>}
                {ex.kind === 'c' && <span>км</span>}
                <span>{ex.kind === 't' ? 'сек' : ex.kind === 'c' ? 'мин' : 'повт.'}</span>
                <span />
              </div>
              {it.sets.map((s, si) => (
                <div key={si} className={`gym-set ${s.done ? 'done' : ''}`}>
                  <span className="gym-set-n">{si + 1}</span>
                  {(ex.kind === 'w' || ex.kind === 'bw') && <NumInput value={s.w} step={0.5} placeholder={ex.kind === 'bw' ? '0' : 'кг'} onChange={(w) => setSet(ei, si, { w })} />}
                  {ex.kind === 'c' && <NumInput value={s.d} step={0.1} placeholder="км" onChange={(d) => setSet(ei, si, { d })} />}
                  {ex.kind === 't' || ex.kind === 'c' ? (
                    <NumInput value={s.t} onChange={(t) => setSet(ei, si, { t })} />
                  ) : (
                    <NumInput value={s.r} onChange={(r) => setSet(ei, si, { r })} />
                  )}
                  <button
                    className={`gym-check ${s.done ? 'on' : ''}`}
                    aria-label="Подход сделан"
                    onClick={() => {
                      const on = !s.done;
                      setSet(ei, si, { done: on });
                      if (on) {
                        sfx('tap');
                        hapticRep();
                        if (ex.kind !== 'c') setRestEnd(Date.now() + REST_DEFAULT * 1000);
                      }
                    }}
                  >
                    <Check size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="gym-run-ex-foot">
              <button
                className="link"
                onClick={() =>
                  edit((r) => ({
                    ...r,
                    items: r.items.map((x, i) => {
                      if (i !== ei) return x;
                      const lastSet = x.sets[x.sets.length - 1];
                      return { ...x, sets: [...x.sets, lastSet ? { ...lastSet, done: false } : freshSets(g, x.ex, 1)[0]] };
                    }),
                  }))
                }
              >
                <Plus size={14} /> Подход
              </button>
              {it.sets.length > 1 && (
                <button className="link" onClick={() => edit((r) => ({ ...r, items: r.items.map((x, i) => (i === ei ? { ...x, sets: x.sets.slice(0, -1) } : x)) }))}>
                  Убрать последний
                </button>
              )}
            </div>
          </div>
        );
      })}

      <button className="secondary" onClick={() => setPicker(true)}>
        <Plus size={18} /> Упражнение
      </button>
      <button className="primary" onClick={() => setConfirm('finish')}>
        Завершить тренировку
      </button>
      <button className="link" onClick={() => setConfirm('cancel')}>
        Отменить тренировку
      </button>

      {restEnd && restLeft > 0 && (
        <div className="gym-rest">
          <span>
            Отдых <b>{clock(restLeft)}</b>
          </span>
          <button onClick={() => setRestEnd(restEnd - 15000)}>−15</button>
          <button onClick={() => setRestEnd(restEnd + 15000)}>+15</button>
          <button aria-label="Пропустить отдых" onClick={() => setRestEnd(null)}>
            <Cross size={14} />
          </button>
        </div>
      )}

      {confirm && (
        <div className="sheet" onClick={() => setConfirm(null)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">{confirm === 'finish' ? 'Завершить тренировку?' : 'Отменить тренировку?'}</div>
            <div className="muted">
              {confirm === 'finish'
                ? doneCount
                  ? `Отмечено ${doneCount} ${setsWord(doneCount)}, ${kgText(vol)}. Неотмеченные подходы не попадут в дневник.`
                  : 'Ни один подход не отмечен галочкой — записывать будет нечего.'
                : 'Все записанные подходы этой тренировки пропадут.'}
            </div>
            <button
              className="primary"
              onClick={() => {
                setConfirm(null);
                if (confirm === 'finish') onFinish();
                else update(cancelRun);
              }}
            >
              {confirm === 'finish' ? (doneCount ? 'Завершить' : 'Выйти без записи') : 'Да, отменить'}
            </button>
            <button className="secondary" onClick={() => setConfirm(null)}>
              Продолжить тренировку
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const clock = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

function TemplateEditor({ tpl, progress, update, onDone }: { tpl: GymTemplate | null; progress: Progress; update: Props['update']; onDone: () => void }) {
  const g = gymOf(progress);
  const [name, setName] = useState(tpl?.name ?? '');
  const [items, setItems] = useState<PlanItem[]>(tpl?.items ?? []);
  const [days, setDays] = useState<number[]>(() => (tpl ? g.week.map((w, i) => (w === tpl.id ? i : -1)).filter((i) => i >= 0) : []));
  const [picker, setPicker] = useState(!tpl);
  const patch = (i: number, p: Partial<PlanItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) =>
    setItems((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const c = [...xs];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  if (picker)
    return (
      <Picker
        onClose={() => (items.length || tpl ? setPicker(false) : onDone())}
        onPick={(ids) => {
          setItems((xs) => [...xs, ...ids.map((ex) => ({ ex, sets: 3, reps: gymExercise(ex).kind === 't' ? 45 : gymExercise(ex).kind === 'c' ? 15 : 10 }))]);
          setPicker(false);
        }}
      />
    );

  const save = () => {
    update((p) => {
      let next = saveTemplate(p, { id: tpl?.id, name: name || 'Моя тренировка', items });
      const id = tpl?.id ?? gymOf(next).templates[gymOf(next).templates.length - 1].id;
      const week = gymOf(next).week;
      for (let d = 0; d < 7; d++) {
        if (days.includes(d)) next = setWeekDay(next, d, id);
        else if (week[d] === id) next = setWeekDay(next, d, null);
      }
      return next;
    });
    onDone();
  };

  return (
    <div className="gym-screen">
      <div className="app-head">
        <button className="pill btn" onClick={onDone}>
          ‹ Назад
        </button>
        <h1>{tpl ? 'Тренировка' : 'Новая тренировка'}</h1>
        <span />
      </div>
      <input className="gym-name" placeholder="Название, например «Грудь и трицепс»" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />

      <div className="section-title">Дни недели</div>
      <div className="gym-daypick">
        {WEEKDAYS.map((d, i) => {
          const other = g.week[i] && g.week[i] !== tpl?.id ? g.templates.find((t) => t.id === g.week[i]) : undefined;
          return (
            <button key={d} className={days.includes(i) ? 'on' : ''} title={other ? `Сейчас: ${other.name}` : undefined} onClick={() => setDays((xs) => (xs.includes(i) ? xs.filter((x) => x !== i) : [...xs, i]))}>
              {d}
              {other && !days.includes(i) && <i />}
            </button>
          );
        })}
      </div>

      <div className="section-title">
        Упражнения
        <span className="muted">{items.length}</span>
      </div>
      {items.map((it, i) => {
        const ex = gymExercise(it.ex);
        const unit = ex.kind === 't' ? 'сек' : ex.kind === 'c' ? 'мин' : 'повт.';
        return (
          <div key={`${it.ex}-${i}`} className="gym-plan-row">
            <div className="gym-order">
              <button disabled={i === 0} onClick={() => move(i, -1)} aria-label="Выше">
                ▲
              </button>
              <button disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Ниже">
                ▼
              </button>
            </div>
            <ExIcon ex={ex} size={36} />
            <span className="gym-ex-text">
              <b>{ex.name}</b>
              <span className="gym-steppers">
                <Stepper value={it.sets} min={1} max={10} onChange={(sets) => patch(i, { sets })} />
                <span className="muted">×</span>
                <Stepper value={it.reps} min={1} max={ex.kind === 't' ? 600 : ex.kind === 'c' ? 120 : 100} step={ex.kind === 't' ? 15 : ex.kind === 'c' ? 5 : 1} onChange={(reps) => patch(i, { reps })} />
                <span className="muted">{unit}</span>
              </span>
            </span>
            <button className="gym-x" aria-label="Убрать" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
              <Trash size={15} />
            </button>
          </div>
        );
      })}
      <button className="secondary" onClick={() => setPicker(true)}>
        <Plus size={18} /> Добавить упражнения
      </button>
      <button className="primary" disabled={!items.length} onClick={save}>
        Сохранить
      </button>
      {tpl && (
        <button
          className="link gym-danger"
          onClick={() => {
            update((p) => deleteTemplate(p, tpl.id));
            onDone();
          }}
        >
          <Trash size={14} /> Удалить тренировку
        </button>
      )}
    </div>
  );
}

function Stepper({ value, min, max, step = 1, onChange }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <span className="gym-stepper">
      <button disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <b>{value}</b>
      <button disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </span>
  );
}

/** Выбор упражнений из каталога: поиск, мышцы, несколько сразу и своё, если чего-то нет. */
function Picker({ onPick, onClose }: { onPick: (ids: string[]) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const list = useMemo(() => searchGym(q, muscle), [q, muscle]);
  const toggle = (id: string) => setSel((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const custom = q.trim().length >= 3 && list.length < 5 && !GYM_EXERCISES.some((e) => e.name.toLowerCase() === q.trim().toLowerCase()) ? customId(q) : null;
  return (
    <div className="gym-screen gym-picker">
      <div className="app-head">
        <button className="pill btn" onClick={onClose}>
          ‹ Назад
        </button>
        <h1>Упражнения</h1>
        <span />
      </div>
      <label className="gym-search">
        <Search size={16} />
        <input placeholder={`Поиск среди ${GYM_EXERCISES.length} упражнений`} value={q} onChange={(e) => setQ(e.target.value)} />
        {q && (
          <button onClick={() => setQ('')} aria-label="Очистить">
            <Cross size={14} />
          </button>
        )}
      </label>
      <div className="gym-chips scroll">
        <button className={`swap-chip ${!muscle ? 'on' : ''}`} onClick={() => setMuscle(null)}>
          Все
        </button>
        {MUSCLES.map((m) => (
          <button key={m.id} className={`swap-chip ${muscle === m.id ? 'on' : ''}`} style={{ ['--mc' as string]: m.color }} onClick={() => setMuscle(muscle === m.id ? null : m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="gym-cat">
        {custom && (
          <button className={`gym-cat-row ${sel.includes(custom) ? 'on' : ''}`} onClick={() => toggle(custom)}>
            <span className="gym-exicon custom">
              <Pencil size={18} />
            </span>
            <span className="gym-ex-text">
              <b>Своё: «{q.trim()}»</b>
              <small>вес × повторы</small>
            </span>
            <span className="gym-tick">{sel.includes(custom) && <Check size={14} />}</span>
          </button>
        )}
        {list.map((e) => (
          <button key={e.id} className={`gym-cat-row ${sel.includes(e.id) ? 'on' : ''}`} onClick={() => toggle(e.id)}>
            <ExIcon ex={e} size={36} />
            <span className="gym-ex-text">
              <b>{e.name}</b>
              <small>{MUSCLES.find((m) => m.id === e.muscle)!.label}</small>
            </span>
            <span className="gym-tick">{sel.includes(e.id) && <Check size={14} />}</span>
          </button>
        ))}
        {!list.length && !custom && <div className="muted gym-note">Ничего не нашлось. Напиши название целиком — добавим как своё.</div>}
      </div>
      <div className="gym-picker-bar">
        <button className="primary" disabled={!sel.length} onClick={() => onPick(sel)}>
          {sel.length ? `Добавить (${sel.length})` : 'Выбери упражнения'}
        </button>
      </div>
    </div>
  );
}
