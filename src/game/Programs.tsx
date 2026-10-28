import { useState } from 'react';
import { amountText, EXERCISE_LABELS, repsEquivalent } from '../repCounter';
import { Check, Coin, Moon, Pause, Play, Timer } from '../icons';
import { sfx } from '../audio';
import { AchBadge } from './Achievements';
import { ACHIEVEMENTS } from './achievements';
import { Remark } from './Dialog';
import { OutfitFace } from './EventScreen';
import { itemById, RARITY_COLORS, RARITY_NAMES } from './items';
import type { Line } from './levels';
import { NPCS } from './npcs';
import { addClanPending, type Progress, recordActivity, saveProgress } from './progress';
import {
  abandonProgram,
  availability,
  dayCoins,
  dayKind,
  type DayKind,
  pauseProgram,
  planDay,
  programById,
  type ProgramDef,
  type ProgramId,
  programOutfit,
  programsOf,
  PROGRAMS,
  restDay,
  saveDay,
  type SetPlan,
  startProgram,
} from './programs';
import { SetList, WorkoutSession } from './WorkoutSession';
import './Programs.css';
import { t } from '../i18n';

// Карточка на главном экране и подходы задания дня живут отдельно: главный экран не тянет за собой тренировку с камерой и 3D.
export { plankDailyWorkout, ProgramsEntry } from './ProgramsEntry';

// Экран «Программы»: список программ Мастера Грома, календарь выбранной, тренировка дня и итог.

const grom = (text: string): Line => ({ who: NPCS.grom.name, face: 'grom', color: NPCS.grom.color, text });
const achOf = (id: ProgramId) => ACHIEVEMENTS.find((a) => a.id === `prog-${id}`)!;
const daysWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? t('день') : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? t('дня') : t('дней'));

/** Быстрая тренировка вне программы: тест планки или задание дня на планку. */
export interface QuickWorkout {
  kind: 'plank' | 'daily';
  tag: string;
  title: string;
  sets: SetPlan[];
}

type View =
  | { kind: 'list' }
  | { kind: 'detail'; id: ProgramId; day?: number }
  | { kind: 'session'; id: ProgramId; day: number; sets: SetPlan[] }
  | { kind: 'quick'; quick: QuickWorkout }
  | { kind: 'summary'; title: string; text: string; coins?: number; xp?: number; outfit?: string; ach?: ProgramId; back: View };

interface Props {
  progress: Progress;
  // Изменение прогресса от последней версии (повторы приходят подряд, пока идёт тренировка).
  update: (fn: (p: Progress) => Progress) => void;
  model: Parameters<typeof WorkoutSession>[0]['model'];
  quick?: QuickWorkout;
  onClose: () => void;
}

export function ProgramsScreen({ progress, update, model, quick, onClose }: Props) {
  const [view, setView] = useState<View>(quick ? { kind: 'quick', quick } : { kind: 'list' });
  const st = programsOf(progress);
  const now = Date.now();
  // Подход сделан: в серию, опыт, задание дня, пропуск и клан.
  const onSet = (s: SetPlan, done: number) => {
    if (done <= 0) return;
    update((p) => addClanPending(recordActivity(p, s.exercise, done, Date.now()), repsEquivalent(s.exercise, done), Date.now()));
  };
  const back = () => (quick ? onClose() : setView({ kind: 'list' }));

  if (view.kind === 'session') {
    const def = programById(view.id)!;
    return (
      <WorkoutSession
        tag={t('{0} · день {1} из {2}', { 0: def.title, 1: view.day, 2: def.days })}
        title={planDay(def, view.day, st.run?.base, progress.baseline, st.run?.factor).title}
        sets={view.sets}
        model={model}
        onSet={onSet}
        onExit={() => setView({ kind: 'detail', id: view.id })}
        onFinish={(done) => {
          let r: ReturnType<typeof saveDay> = null;
          update((p) => {
            r = saveDay(p, done, Date.now());
            return r?.progress ?? p;
          });
          const res = r as ReturnType<typeof saveDay>;
          if (!res) return setView({ kind: 'detail', id: view.id });
          if (res.completed) sfx('chest');
          const kind = dayKind(def, view.day);
          const pct = Math.round(res.share * 100);
          const text = res.completed
            ? t('Ты прошёл «{0}». Я горжусь тобой, боец. Носи награду с честью!', { 0: def.title })
            : res.retry
              ? t('Финал взят на {0}%. Отдохни, а завтра добьём — я в тебя верю.', { 0: pct })
              : kind === 'test'
                ? t('Записал твой старт: {0}. От этого и поведу.', { 0: view.sets.map((s, i) => `${EXERCISE_LABELS[s.exercise].toLowerCase()} ${amountText(s.exercise, done[i])}`).join(', ') })
                : pct >= 100
                  ? t('Всё сделано! Дальше будет чуть тяжелее — ты готов.')
                  : pct >= 80
                    ? t('Сделано {0}%. Хорошая работа, завтра продолжим.', { 0: pct })
                    : t('Сделано {0}%. Ничего, следующие дни сделаю полегче.', { 0: pct });
          setView({ kind: 'summary', title: res.completed ? t('Программа пройдена!') : res.retry ? t('Почти!') : t('День {0} пройден', { 0: view.day }), text, coins: res.coins, xp: res.xp, outfit: res.outfit, ach: res.completed ? def.id : undefined, back: { kind: 'detail', id: view.id } });
        }}
      />
    );
  }

  if (view.kind === 'quick') {
    const q = view.quick;
    return (
      <WorkoutSession
        tag={q.tag}
        title={q.title}
        sets={q.sets}
        model={model}
        onSet={onSet}
        onExit={back}
        onFinish={(done) => {
          const best = Math.max(...done);
          if (q.kind === 'plank' && best >= 10) update((p) => saveProgress({ ...p, baseline: { ...p.baseline, plank: best } }));
          const text =
            q.kind === 'plank'
              ? best >= 10
                ? t('{0} в планке! Запомнил: задания на планку теперь под тебя.', { 0: amountText('plank', best) })
                : t('Пока совсем немного. Встань боком к камере, локти под плечи — и держи.')
              : t('Задание сделано, забери награду на главном экране.');
          setView({ kind: 'summary', title: q.kind === 'plank' ? t('Планка на время') : t('Готово!'), text, back: { kind: 'list' } });
        }}
      />
    );
  }

  if (view.kind === 'summary') {
    const outfit = view.outfit ? itemById(view.outfit) : undefined;
    return (
      <div className="prog-screen">
        <div className="prog-summary">
          <div className="result-title">{view.title}</div>
          <div className="prog-gains">
            {!!view.coins && (
              <span>
                <Coin size={15} className="coin" /> +{view.coins}
              </span>
            )}
            {!!view.xp && <span>{t('+{0} опыта', { 0: view.xp })}</span>}
          </div>
          {outfit && (
            <div className="prog-reward">
              <OutfitFace id={outfit.id} size={52} />
              <div>
                <div className="prog-reward-name" style={{ color: RARITY_COLORS[outfit.rarity] }}>
                  {t('Облик: {0}', { 0: outfit.name })}
                </div>
                <div className="muted">{t('{0} · уже в инвентаре', { 0: RARITY_NAMES[outfit.rarity] })}</div>
              </div>
            </div>
          )}
          {view.ach && (
            <div className="prog-reward">
              <AchBadge ach={achOf(view.ach)} done size={48} />
              <div>
                <div className="prog-reward-name">{t('Титул: {0}', { 0: achOf(view.ach).title })}</div>
                <div className="muted">{t('Забери в «Достижениях» и носи под именем')}</div>
              </div>
            </div>
          )}
          <Remark line={grom(view.text)} />
        </div>
        <button className="primary" onClick={() => (quick ? onClose() : setView(view.back))}>
          {t('Дальше')}
        </button>
      </div>
    );
  }

  if (view.kind === 'detail') return <ProgramDetail key={`${view.id}-${st.run?.day ?? 0}`} def={programById(view.id)!} progress={progress} update={update} select={view.day} setView={setView} />;

  const active = st.run && programById(st.run.id);
  return (
    <div className="prog-screen">
      <div className="app-head">
        <button className="pill btn" onClick={onClose}>
          {t('‹ Назад')}
        </button>
        <h1>{t('Программы')}</h1>
        <span className="pill">
          <Coin className="coin" /> {progress.coins}
        </span>
      </div>
      <Remark
        line={grom(
          active
            ? t('Мы идём по программе «{0}». Не сворачивай с пути, боец.', { 0: active.title })
            : st.done.length
              ? t('Ещё одна программа? Уважаю. Выбирай — я поведу.')
              : t('Хочешь настоящий результат — нужен план. Выбери программу: в первый день проверю твою силу и подберу нагрузку под тебя.'),
        )}
      />
      {active && st.run && <ActiveCard def={active} progress={progress} onOpen={() => setView({ kind: 'detail', id: active.id })} />}

      <button
        className="prog-quick"
        onClick={() => setView({ kind: 'quick', quick: { kind: 'plank', tag: t('Планка на время'), title: t('Сколько продержишься?'), sets: [{ exercise: 'plank', target: progress.baseline.plank ?? 30, rest: 0, max: true }] } })}
      >
        <span className="prog-icon" style={{ ['--pc' as string]: '#c4b5fd' }}>
          <Timer size={22} />
        </span>
        <span className="prog-card-text">
          <b>{t('Планка на время')}</b>
          <small>{t('Сколько продержишься? Рекорд: {0}', { 0: progress.best.plank ? amountText('plank', progress.best.plank.reps) : t('ещё нет') })}</small>
        </span>
        <span className="chev">›</span>
      </button>

      <div className="section-title">{t('Все программы')}</div>
      <div className="prog-list">
        {PROGRAMS.map((def) => (
          <ProgramCard key={def.id} def={def} progress={progress} onOpen={() => setView({ kind: 'detail', id: def.id })} />
        ))}
      </div>
    </div>
  );
}

const FOCUS_ICON = (def: ProgramDef) => <AchBadge ach={achOf(def.id)} done size={44} />;

function ProgramCard({ def, progress, onOpen }: { def: ProgramDef; progress: Progress; onOpen: () => void }) {
  const st = programsOf(progress);
  const running = st.run?.id === def.id;
  const passed = st.done.includes(def.id);
  const outfit = programOutfit(def);
  return (
    <button className={`prog-card ${running ? 'on' : ''}`} style={{ ['--pc' as string]: def.color }} onClick={onOpen}>
      {FOCUS_ICON(def)}
      <span className="prog-card-text">
        <b>{def.title}</b>
        <small>{def.short}</small>
        <span className="prog-tags">
          <span className="prog-tag">{def.level}</span>
          <span className="prog-tag">
            {def.days} {daysWord(def.days)}
          </span>
          {outfit && <span className="prog-tag gift">{t('облик «{0}»', { 0: outfit.name })}</span>}
          {running && <span className="prog-tag live">{t('идёт · день {0}', { 0: st.run!.day })}</span>}
          {passed && (
            <span className="prog-tag done">
              <Check size={11} /> {t('пройдена')}
            </span>
          )}
        </span>
      </span>
      <span className="chev">›</span>
    </button>
  );
}

function ActiveCard({ def, progress, onOpen }: { def: ProgramDef; progress: Progress; onOpen: () => void }) {
  const run = programsOf(progress).run!;
  const av = availability(run, Date.now());
  const done = run.day - 1;
  return (
    <button className="prog-active" style={{ ['--pc' as string]: def.color }} onClick={onOpen}>
      <span className="prog-active-top">
        <span className="level-tag">{t('Сейчас')}</span>
        <span className={`prog-chip ${av}`}>{AV_TEXT[av]}</span>
      </span>
      <b>{def.title}</b>
      <span className="pass-bar">
        <span style={{ display: 'block', width: `${(done / def.days) * 100}%`, background: def.color }} />
      </span>
      <small>
        {t('День {0} из {1} · {2}', { 0: run.day, 1: def.days, 2: planDay(def, run.day, run.base, progress.baseline, run.factor).title.toLowerCase() })}
      </small>
    </button>
  );
}

const AV_TEXT = { ready: t('тренировка сегодня'), rest: t('день отдыха'), tomorrow: t('сегодня всё, до завтра'), paused: t('на паузе') } as const;
const KIND_NOTE: Record<DayKind, string> = {
  test: t('Сделай столько, сколько сможешь, в каждом подходе. Подход закончится сам, когда остановишься.'),
  train: t('Цели посчитаны от твоего теста и того, как идут дни.'),
  rest: t('Мышцы растут, пока ты отдыхаешь. Сегодня без нагрузки.'),
  final: t('Покажи, чему научился.'),
};

function ProgramDetail({ def, progress, update, select, setView }: { def: ProgramDef; progress: Progress; update: Props['update']; select?: number; setView: (v: View) => void }) {
  const st = programsOf(progress);
  const run = st.run?.id === def.id ? st.run : undefined;
  const other = st.run && !run ? programById(st.run.id) : undefined;
  const [day, setDay] = useState(select ?? run?.day ?? 1);
  const [confirm, setConfirm] = useState(false);
  const now = Date.now();
  const plan = planDay(def, day, run?.base, progress.baseline, run?.factor);
  const av = run && availability(run, now);
  const outfit = programOutfit(def);
  const ach = achOf(def.id);
  const save = (fn: (p: Progress) => Progress | null) => update((p) => {
    const next = fn(p);
    return next ? saveProgress(next) : p;
  });
  const isToday = run && day === run.day;

  return (
    <div className="prog-screen">
      <div className="app-head">
        <button className="pill btn" onClick={() => setView({ kind: 'list' })}>
          {t('‹ Программы')}
        </button>
        <span className="prog-tag">{def.level}</span>
      </div>
      <div className="prog-hero" style={{ ['--pc' as string]: def.color }}>
        {FOCUS_ICON(def)}
        <div>
          <div className="prog-hero-title">{def.title}</div>
          <div className="muted">
            {def.focus.map((e) => EXERCISE_LABELS[e]).join(' · ')} · {t('{0} {1}, отдых каждый {2}-й', { 0: def.days, 1: daysWord(def.days), 2: def.restEvery })}
          </div>
        </div>
      </div>
      <Remark line={grom(def.about)} />

      <div className="prog-rewards">
        <span className="prog-rewards-label">{t('Награда за финал')}</span>
        <span className="prog-rewards-row">
          <span>
            <Coin size={14} className="coin" /> {def.coins}
          </span>
          {outfit && (
            <span style={{ color: RARITY_COLORS[outfit.rarity] }}>
              <OutfitFace id={outfit.id} size={26} /> {outfit.name}
            </span>
          )}
          <span>
            <AchBadge ach={ach} done size={24} /> {t('титул «{0}»', { 0: ach.title })}
          </span>
        </span>
      </div>

      <div className="prog-cal">
        {Array.from({ length: def.days }, (_, i) => i + 1).map((d) => {
          const kind = dayKind(def, d);
          const passed = run ? d < run.day : st.done.includes(def.id);
          const share = run?.log[d];
          return (
            <button key={d} className={`prog-day ${kind} ${passed ? 'passed' : ''} ${run && d === run.day ? 'today' : ''} ${d === day ? 'sel' : ''} ${share != null && share < 0.8 ? 'weak' : ''}`} onClick={() => setDay(d)}>
              {passed && kind !== 'rest' ? <Check size={13} /> : kind === 'rest' ? <Moon size={12} /> : d}
            </button>
          );
        })}
      </div>

      <div className="prog-dayplan">
        <div className="prog-dayplan-head">
          <b>
            {t('День {0} · {1}', { 0: day, 1: plan.title })}
          </b>
          {plan.kind !== 'rest' && plan.kind !== 'final' && (
            <span className="daily-gift">
              <Coin size={13} className="coin" /> {dayCoins(plan.kind, day)}
            </span>
          )}
        </div>
        {plan.sets.length ? <SetList sets={plan.sets} done={[]} current={-1} /> : null}
        <div className="muted">
          {run?.log[day] != null && day < run.day ? t('Сделано {0}%. ', { 0: Math.round(run.log[day] * 100) }) : ''}
          {KIND_NOTE[plan.kind]}
          {plan.kind === 'train' && run && run.factor !== 1 && t(' Поправка под тебя: {0}{1}%.', { 0: run.factor > 1 ? '+' : '', 1: Math.round((run.factor - 1) * 100) })}
          {plan.sets.length > 0 && t(' Отдых между подходами {0}.', { 0: restRange(plan.sets) })}
        </div>
      </div>

      {!run && !other && (
        <button className="primary" onClick={() => save((p) => startProgram(p, def.id, Date.now()))}>
          {st.done.includes(def.id) ? t('Пройти ещё раз') : t('Начать программу')}
        </button>
      )}
      {other && <div className="muted prog-note">{t('Сейчас идёт «{0}». Одна программа за раз: закончи или брось её, чтобы начать эту.', { 0: other.title })}</div>}
      {run && av === 'ready' && (
        <button className="primary" onClick={() => (isToday ? setView({ kind: 'session', id: def.id, day: run.day, sets: planDay(def, run.day, run.base, progress.baseline, run.factor).sets }) : setDay(run.day))}>
          {isToday ? t('Начать день {0}', { 0: run.day }) : t('К дню {0}', { 0: run.day })}
        </button>
      )}
      {run && av === 'rest' && (
        <button className="primary" onClick={() => save((p) => restDay(p, Date.now()))}>
          <Moon size={18} /> {t('Отдыхаю сегодня')}
        </button>
      )}
      {run && av === 'tomorrow' && (
        <button className="primary" disabled>
          {t('Следующий день — завтра')}
        </button>
      )}
      {run && av === 'paused' && (
        <button className="primary" onClick={() => save((p) => pauseProgram(p, false))}>
          <Play size={16} /> {t('Продолжить программу')}
        </button>
      )}
      {run && (
        <div className="prog-manage">
          {av !== 'paused' && (
            <button className="small-btn ghost" onClick={() => save((p) => pauseProgram(p, true))}>
              <Pause size={14} /> {t('Пауза')}
            </button>
          )}
          {confirm ? (
            <>
              <span className="muted">{t('Весь прогресс программы пропадёт.')}</span>
              <button className="small-btn danger" onClick={() => save(abandonProgram)}>
                {t('Бросить')}
              </button>
              <button className="small-btn ghost" onClick={() => setConfirm(false)}>
                {t('Нет')}
              </button>
            </>
          ) : (
            <button className="small-btn ghost" onClick={() => setConfirm(true)}>
              {t('Бросить программу')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const restRange = (sets: SetPlan[]) => {
  const rests = sets.slice(0, -1).map((s) => s.rest);
  if (!rests.length) return t('не нужен');
  const lo = Math.min(...rests);
  const hi = Math.max(...rests);
  return lo === hi ? t('{0} с', { 0: lo }) : t('{0}–{1} с', { 0: lo, 1: hi });
};
