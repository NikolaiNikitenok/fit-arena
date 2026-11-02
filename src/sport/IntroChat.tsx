// Знакомство в виде чата с тренером (решение владельца, 2026-11-02): новичок отвечает готовыми фразами —
// цель, уровень, сколько времени, — видит, как выглядят оба стиля, и выбирает «Спорт» или «Приключение».
// «Спорт» сразу ведёт на первый подход, «Приключение» передаёт игрока Мастеру Грому (Onboarding.tsx).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Dumbbell } from '../icons';
import { markFirstOpen, track } from '../telemetry';
import { preloadPose } from '../useRepCamera';
import { unlockVoice } from '../voice';
import { enableOrientation } from '../orientation';
import { openPrivacy } from '../privacy';
import { HaveHeroButton } from '../account/Account';
import { WebLoginButtons } from '../account/WebLogin';
import { useBusy } from '../updates/busy';
import { setSetting, type Settings } from '../settings';
import { t } from '../i18n';
import { Gas, Snake, StepList } from './SportStage';
import './sport.css';
import './intro.css';
import { dayGoalFor } from './dayGoal';

export type IntroGoal = NonNullable<Settings['goal']>;

const GOALS: { id: IntroGoal; label: string; reply: string }[] = [
  { id: 'strength', label: t('Стать сильнее'), reply: t('Отлично. Сила растёт от регулярных подходов — буду понемногу поднимать планку.') },
  { id: 'shape', label: t('Прийти в форму'), reply: t('Хороший выбор. Короткие подходы каждый день дают больше, чем час раз в неделю.') },
  { id: 'habit', label: t('Завести привычку'), reply: t('Тогда главное — не пропускать. Буду считать серию дней и напоминать.') },
  { id: 'compete', label: t('Соревноваться'), reply: t('Тогда тебе в рейтинг и дуэли: соперники — живые люди, повторы считает камера.') },
];
const LEVELS = [t('Пока ни одного'), t('До 10'), t('10–25'), t('Больше 25')];
const MINUTES = [t('5 минут'), t('10–15 минут'), t('20 и больше')];

interface Msg {
  me?: boolean;
  text?: string;
  node?: ReactNode;
}
interface Chip {
  label: string;
  primary?: boolean;
  act: () => void;
}

/** Живой пример строгой тренировки: змейка сама набирает повторы, список упражнений раскрывается. */
function SportPreview() {
  const [n, setN] = useState(6);
  useEffect(() => {
    const id = setInterval(() => setN((v) => (v >= 20 ? 4 : v + 1)), 700);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="ic-phone sport">
      <div className="sp-stage live ic-mini">
        <Gas />
        <Snake share={n / 20} reps={n} size={118}>
          <b>{n}</b>
          <small>{t('из {0}', { 0: 20 })}</small>
        </Snake>
        <StepList
          steps={[
            { exercise: 'squat', target: 20, done: 20 },
            { exercise: 'pushup', target: 20, done: n },
            { exercise: 'situp', target: 20, done: 0 },
          ]}
        />
      </div>
    </div>
  );
}

function AdventurePreview() {
  return (
    <div className="ic-phone adv">
      <img src="/intro/adventure.webp" alt="" loading="lazy" />
    </div>
  );
}

export function IntroChat({ onDone }: { onDone: (style: Settings['style'], start: boolean) => void }) {
  useBusy(true);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [chips, setChips] = useState<Chip[]>([]);
  const [typing, setTyping] = useState(false);
  const [first, setFirst] = useState(true);
  const answers = useRef({ goal: 'shape' as IntroGoal, level: 1, minutes: 1 });
  const end = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  // Тренер «печатает»: сообщения появляются по одному, потом — варианты ответа.
  const say = (lines: Msg[], next: Chip[]) => {
    setChips([]);
    let delay = 250;
    lines.forEach((m, i) => {
      timers.current.push(window.setTimeout(() => setTyping(true), delay));
      delay += Math.min(1400, 450 + (m.text?.length ?? 40) * 9);
      timers.current.push(
        window.setTimeout(() => {
          setTyping(false);
          setMsgs((v) => [...v, m]);
          if (i === lines.length - 1) setChips(next);
        }, delay),
      );
      delay += 200;
    });
  };
  const answer = (label: string, step: string, value: string | number, then: () => void) => {
    setFirst(false);
    track('intro', `${step}:${value}`);
    setMsgs((v) => [...v, { me: true, text: label }]);
    then();
  };

  const askGoal = () =>
    say(
      [{ text: t('Привет! Я тренер Арены. Помогу настроить всё под тебя — это полминуты.') }, { text: t('Для начала: зачем ты здесь?') }],
      GOALS.map((g) => ({
        label: g.label,
        act: () =>
          answer(g.label, 'goal', g.id, () => {
            answers.current.goal = g.id;
            setSetting('goal', g.id);
            askLevel(g.reply);
          }),
      })),
    );
  const askLevel = (reply: string) =>
    say(
      [{ text: reply }, { text: t('Сколько отжиманий подряд сделаешь прямо сейчас?') }],
      LEVELS.map((l, i) => ({ label: l, act: () => answer(l, 'level', i, () => ((answers.current.level = i), askMinutes())) })),
    );
  const askMinutes = () =>
    say(
      [{ text: t('Записал. Точнее уровень покажет первый подход.') }, { text: t('Сколько времени в день готов тратить?') }],
      MINUTES.map((m, i) => ({ label: m, act: () => answer(m, 'minutes', i, () => ((answers.current.minutes = i), askStyle())) })),
    );
  const askStyle = () =>
    say(
      [
        { text: t('Последнее: как тебе удобнее видеть приложение? Покажу оба варианта.') },
        { text: t('«Спорт» — строго и профессионально: только упражнения, цифры, темп и рейтинг.'), node: <SportPreview /> },
        { text: t('«Приключение» — герой, сюжет и боссы: каждый повтор — удар по врагу.'), node: <AdventurePreview /> },
        { text: t('В обоих стилях всё засчитывается одинаково: рейтинг, дуэли, награды. Поменять можно в настройках.') },
      ],
      [
        { label: t('Спорт'), primary: true, act: () => answer(t('Спорт'), 'style', 'sport', pickSport) },
        { label: t('Приключение'), act: () => answer(t('Приключение'), 'style', 'adventure', pickAdventure) },
      ],
    );
  const pickSport = () => {
    const goal = dayGoalFor(answers.current.level, answers.current.minutes);
    setSetting('dayGoal', goal);
    setSetting('style', 'sport');
    setSetting('styleChosen', true);
    track('style_pick', 'sport:chat');
    say(
      [
        { text: t('Принято: строгий режим. Без сюжета и героев — только тренировки, цифры и соперники.') },
        { text: t('Твоя цель на день — {0} повторов.', { 0: goal }) },
        { text: t('Первый подход — минута приседаний, так я узнаю твой уровень. Поставь телефон в паре метров, чтобы ты был виден целиком. Видео никуда не уходит.') },
      ],
      [
        {
          label: t('Начать подход'),
          primary: true,
          act: () => {
            // Прямо из нажатия: иначе iOS в Telegram не даст голосу и датчику наклона работать.
            unlockVoice();
            enableOrientation();
            track('onb_done', 1);
            onDone('sport', true);
          },
        },
        { label: t('Сначала осмотрюсь'), act: () => (track('onb_done', 0), onDone('sport', false)) },
      ],
    );
  };
  const pickAdventure = () => {
    setSetting('dayGoal', dayGoalFor(answers.current.level, answers.current.minutes));
    setSetting('style', 'adventure');
    setSetting('styleChosen', true);
    track('style_pick', 'adventure:chat');
    say([{ text: t('Тогда добро пожаловать в Атлетию! Передаю тебя Мастеру Грому — он всё покажет.') }], [
      { label: t('Вперёд'), primary: true, act: () => onDone('adventure', false) },
    ]);
  };

  useEffect(() => {
    markFirstOpen();
    track('onb_step', 0);
    // Модель распознавания (≈19 МБ) качаем, пока новичок отвечает.
    void preloadPose().catch(() => {});
    askGoal();
    const list = timers.current;
    return () => list.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs.length, typing, chips.length]);

  return (
    <div className="ic">
      <Gas calm />
      <header className="ic-head">
        <span className="ic-ava">
          <Dumbbell size={20} />
        </span>
        <span>
          <b>{t('Тренер Арены')}</b>
          <small>{typing ? t('печатает…') : t('онлайн')}</small>
        </span>
      </header>
      <div className="ic-feed">
        {msgs.map((m, i) => (
          <div key={i} className={`ic-msg ${m.me ? 'me' : ''}`}>
            {m.text && <div className="ic-bubble">{m.text}</div>}
            {m.node}
          </div>
        ))}
        {typing && (
          <div className="ic-msg">
            <div className="ic-bubble ic-typing">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
        <div ref={end} />
      </div>
      <footer className="ic-foot">
        {chips.length > 0 && (
          <div className="ic-chips">
            {chips.map((c) => (
              <button key={c.label} className={c.primary ? 'primary' : ''} onClick={c.act}>
                {c.label}
              </button>
            ))}
          </div>
        )}
        {first && chips.length > 0 && (
          <div className="ic-login">
            <HaveHeroButton />
            <WebLoginButtons />
          </div>
        )}
        <button className="link inline ic-privacy" onClick={openPrivacy}>
          {t('Политика конфиденциальности')}
        </button>
      </footer>
    </div>
  );
}
