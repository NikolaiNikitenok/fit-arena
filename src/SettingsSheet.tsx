import { type ReactNode, useEffect, useState } from 'react';
import { ChannelOffer, channelOfferDue } from './social/ChannelOffer';
import { setAutoPostsPref } from './social/autoPost';
import { StyleSwitch } from './sport/StylePick';
import { calibrationStatus, CalibrationStatus, resetCalibration, useCalibration } from './calibration';
import { RecalibrateScreen } from './RecalibrateScreen';
import { cloudState, onCloud, setLetters, setRaidNotify, setRemind } from './cloud';
import { heroLevel, heroXp, Progress } from './game/progress';
import { EXERCISE_LABELS, REP_EXERCISES, RepExercise } from './repCounter';
import { setSetting, Settings, useSettings } from './settings';
import { tg } from './telegram';
import { AdminChargeRow, AdminStatsRow, DeleteDataRow, PrivacyLink } from './SettingsExtra';
import { BlackListRow } from './moderation/BlackList';
import { Sheet } from './Sheet';
import { HomeShortcutRow } from './HomeShortcut';
import { getLang, Lang, setLang, t, locale } from './i18n';
import { AccountRow } from './account/Account';
import { WebLoginRow } from './account/WebLogin';
import { ChangesList } from './updates/UpdateBanner';
import { CHANGELOG } from './updates/changelog';
import { APP_VERSION } from './telemetry';
import { Bell, Camera, ChevronLeft, Info, Sparkles, Speaker, UserCircle, Wrench } from './icons';

type ToggleKey = { [K in keyof Settings]-?: Settings[K] extends boolean ? K : never }[keyof Settings];
const TOGGLES: Record<string, { key: ToggleKey; title: string; text: string }> = {
  sound: { key: 'sound', title: t('Звуки'), text: t('Сигнал на каждый повтор, удары, победа и монеты. Слышно темп, не глядя на экран.') },
  music: { key: 'music', title: t('Музыка'), text: t('Тихая фоновая мелодия: своя в каждом мире, барабаны на арене.') },
  voice: { key: 'voice', title: t('Голос тренера'), text: t('Мастер Гром вслух считает повторы, подсказывает время и технику. Нужен русский голос в телефоне.') },
  haptics: { key: 'haptics', title: t('Вибрация'), text: t('Телефон коротко вибрирует на повтор.') },
  guide: { key: 'guide', title: t('Подсказка перед уровнем'), text: t('3D-схема, как поставить телефон.') },
  warmup: { key: 'warmup', title: t('Разминка'), text: t('Перед первым подходом за день Гром предложит размяться пару минут. Можно пропустить.') },
  morning: { key: 'morning', title: t('Утренняя зарядка'), text: t('Утром при первом заходе предложим начать день с короткой зарядки.') },
  story: { key: 'story', title: t('Диалоги сюжета'), text: t('Разговоры с героями перед уровнями. Без них сразу к тренировке.') },
  skeleton: { key: 'skeleton', title: t('Скелет на видео'), text: t('Линии позы поверх камеры: видно, что приложение тебя распознаёт.') },
  dayNight: { key: 'dayNight', title: t('День и ночь в деревне'), text: t('Деревня живёт по твоим часам: золотой вечер, ночью горят фонари. Без этого всегда светлый день.') },
  villageFx: { key: 'villageFx', title: t('Погода и эффекты деревни'), text: t('Дождь и снег, светлячки, пыль от разрушений, летящие монеты и салют. Выключи, если телефон греется.') },
  flyIn: { key: 'flyIn', title: t('Пролёт над деревней'), text: t('Камера плавно облетает деревню, когда ты в неё заходишь.') },
  homeList: { key: 'homeList', title: t('Главная списком'), text: t('Все разделы друг под другом, с прокруткой — как раньше. Без этого герой во весь экран, а кнопки по бокам.') },
  autoPosts: { key: 'autoPosts', title: t('Рассказывать о победах в ленте'), text: t('Игра сама выложит в ленту победу над боссом, серию тренировок, новый уровень героя и выигранный вызов в чате.') },
  lowPower: { key: 'lowPower', title: t('Экономный режим'), text: t('Без теней и сглаживания, 3D попроще и в меньшем разрешении. Помогает, если телефон слабый или греется. На слабых телефонах включается сам.') },
};

function Toggles({ keys }: { keys: ToggleKey[] }) {
  const s = useSettings();
  return (
    <>
      {keys.map((k) => {
        const tm = TOGGLES[k];
        return (
          <label key={k} className="toggle-row">
            <div>
              <div className="toggle-title">{tm.title}</div>
              <div className="muted">{tm.text}</div>
            </div>
            <input
              type="checkbox"
              className="switch"
              checked={s[k]}
              onChange={(e) => {
                setSetting(k, e.target.checked);
                if (k === 'autoPosts') setAutoPostsPref(e.target.checked);
              }}
            />
          </label>
        );
      })}
    </>
  );
}

const LANGS: [Lang, string][] = [
  ['ru', 'Русский'],
  ['en', 'English'],
];

type Section = 'sound' | 'training' | 'graphics' | 'notify' | 'account' | 'about' | 'admin';
type Tone = 'accent' | 'mint' | 'violet' | 'gold' | 'blue' | 'grey' | 'rose';

const SOUND: ToggleKey[] = ['sound', 'music', 'voice', 'haptics'];
const TRAINING: ToggleKey[] = ['guide', 'warmup', 'morning', 'story', 'skeleton'];
const GRAPHICS: ToggleKey[] = ['lowPower', 'dayNight', 'villageFx', 'flyIn', 'homeList'];

/**
 * Настройки: короткий список разделов, каждый открывается своей шторкой.
 * Шторка раздела стоит на месте главной, а не внутри неё: внутри анимированного листа fixed считается от него.
 * Смахнуть раздел вниз — вернуться к списку.
 */
export function SettingsSheet({ progress, onReset, onIntro, onClose }: { progress: Progress; onReset: () => void; onIntro: () => void; onClose: () => void }) {
  const s = useSettings();
  const [section, setSection] = useState<Section | null>(null);
  const [admin, setAdmin] = useState(() => !!cloudState()?.admin);
  useEffect(() => onCloud((c) => setAdmin(c.admin)), []);
  const back = () => setSection(null);

  if (section)
    return (
      // Свои ключи у шторок раздела и списка: иначе React переиспользует одну шторку, и список
      // наследует от закрытого свайпом раздела «уехавший» лист — невидимый, но перехватывающий нажатия.
      <Sheet key={section} onClose={back} bodyClassName="settings-sub">
        <SubHead title={SECTION_TITLES[section]} onBack={back} />
        {section === 'sound' && <Toggles keys={SOUND} />}
        {section === 'training' && (
          <>
            <Toggles keys={TRAINING} />
            <RecalibrateRow />
            <div className="settings-note">
              <b>{t('Камера и приватность.')}</b> {t('Видео обрабатывается прямо на телефоне и никуда не отправляется. На сервер уходят только результаты и прогресс.')}
            </div>
          </>
        )}
        {section === 'graphics' && (
          <>
            <div className="toggle-row style-row">
              <div>
                <div className="toggle-title">{t('Стиль игры')}</div>
                <div className="muted">{t('«Приключение» — 3D-герои и сюжет. «Спорт» — строгие экраны с цифрами, без сказки.')}</div>
              </div>
            </div>
            <StyleSwitch value={s.style} />
            <Toggles keys={GRAPHICS} />
          </>
        )}
        {section === 'notify' && (
          <>
            {channelOfferDue() && <ChannelOffer place="settings" />}
            <RemindRow />
            <Toggles keys={['autoPosts']} />
            <NotifyRow field="raidNotify" set={setRaidNotify} title={t('Уведомления о рейде')} text={t('Бот напишет в субботу, когда босс клана проснётся, напомнит в воскресенье вечером о несделанных атаках и пришлёт итог рейда.')} />
            <NotifyRow field="letters" set={setLetters} title={t('Письма Мастера Грома')} text={t('Если пропадёшь на 3 или 7 дней, Гром напишет и оставит подарок; по понедельникам — сколько ты сделал за неделю. Не чаще одного сообщения в день.')} />
          </>
        )}
        {section === 'account' && (
          <>
            <div className="settings-note">
              <b>{t('Прогресс')}</b> {t('сохраняется на сервере и вернётся на новом телефоне: герой {0} уровня, {1} пройденных уровней.', { 0: heroLevel(heroXp(progress)).level, 1: Object.keys(progress.stars).length })}
            </div>
            <WebLoginRow />
            <AccountRow />
            <TelegramIdRow />
            <BlackListRow />
            <ResetRow onReset={onReset} onClose={onClose} />
            <DeleteDataRow />
          </>
        )}
        {section === 'about' && <AboutSection onIntro={onIntro} />}
        {section === 'admin' && (
          <>
            <AdminStatsRow />
            <AdminChargeRow />
          </>
        )}
      </Sheet>
    );

  const rows: { id: Section; tone: Tone; icon: ReactNode; sub: string }[] = [
    { id: 'sound', tone: 'accent', icon: <Speaker />, sub: t('Звуки, музыка, голос тренера') },
    { id: 'training', tone: 'mint', icon: <Camera />, sub: t('Подсказки, разминка, скелет, калибровка') },
    { id: 'graphics', tone: 'violet', icon: <Sparkles />, sub: s.lowPower ? t('Включён экономный режим') : t('Погода, день и ночь, эффекты') },
    { id: 'notify', tone: 'gold', icon: <Bell />, sub: t('Напоминания и рейды клана') },
    { id: 'account', tone: 'blue', icon: <UserCircle />, sub: t('Вход, прогресс, чёрный список') },
    { id: 'about', tone: 'grey', icon: <Info />, sub: t('Обновления и приватность') },
  ];
  if (admin) rows.push({ id: 'admin', tone: 'rose', icon: <Wrench />, sub: t('Статистика, FPS, заряд подземелья') });

  return (
    <Sheet key="list" onClose={onClose}>
      <div className="level-title">{t('Настройки')}</div>
      {/* Язык — названия на своих языках, чтобы найти свой, даже не понимая текущий. */}
      <div className="tabs small" role="group" aria-label="Язык / Language">
        {LANGS.map(([l, name]) => (
          <button key={l} className={getLang() === l ? 'active' : ''} onClick={() => getLang() !== l && setLang(l)}>
            {name}
          </button>
        ))}
      </div>
      <div className="settings-menu">
        {rows.map((r) => (
          <button key={r.id} className="settings-menu-row" onClick={() => setSection(r.id)}>
            <span className={`settings-menu-icon ${r.tone}`}>{r.icon}</span>
            <span className="settings-menu-text">
              <b>{SECTION_TITLES[r.id]}</b>
              <small>{r.sub}</small>
            </span>
            <span className="settings-menu-chev" aria-hidden>
              ›
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

const SECTION_TITLES: Record<Section, string> = {
  sound: t('Звук и вибрация'),
  training: t('Камера и тренировки'),
  graphics: t('Графика'),
  notify: t('Уведомления'),
  account: t('Аккаунт и данные'),
  about: t('Об игре'),
  admin: t('Админ'),
};

/** Заголовок раздела со стрелкой назад к списку. */
function SubHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="settings-sub-head">
      <button className="settings-back" onClick={onBack} aria-label={t('К настройкам')}>
        <ChevronLeft size={20} />
      </button>
      <div className="level-title">{title}</div>
    </div>
  );
}

/** «Начать игру заново» с подтверждением. */
function ResetRow({ onReset, onClose }: { onReset: () => void; onClose: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <div className="danger-row">
      <span>{t('Стереть героя, предметы и монеты?')}</span>
      <button
        className="small-btn danger"
        onClick={() => {
          onReset();
          onClose();
        }}
      >
        {t('Стереть')}
      </button>
      <button className="small-btn ghost" onClick={() => setConfirm(false)}>
        {t('Отмена')}
      </button>
    </div>
  ) : (
    <button className="link danger-link" onClick={() => setConfirm(true)}>
      {t('Начать игру заново')}
    </button>
  );
}

/** «Об игре»: знакомство, история обновлений, приватность, авторы. */
function AboutSection({ onIntro }: { onIntro: () => void }) {
  const [history, setHistory] = useState(false);
  return (
    <>
      <button className="secondary" onClick={onIntro}>
        {t('Посмотреть знакомство заново')}
      </button>
      <button className="secondary" onClick={() => setHistory((v) => !v)}>
        {history ? t('Скрыть историю обновлений') : t('История обновлений')}
      </button>
      {history && <ChangesList entries={CHANGELOG} />}
      <HomeShortcutRow />
      <div className="settings-note">
        <b>{t('Камера и приватность.')}</b> {t('Видео обрабатывается прямо на телефоне и никуда не отправляется. На сервер уходят только результаты и прогресс.')} <PrivacyLink />
      </div>
      {/* Лицензия банка звуков требует указать авторов. */}
      <small className="muted credits">
        {t('Версия {0}. Модели — KayKit (Kay Lousberg, CC0). Инструменты в музыке — FluidR3 GM (Frank Wen), CC BY 3.0.', { 0: APP_VERSION })}
      </small>
    </>
  );
}

const dateText = (at: number) => new Date(at).toLocaleDateString(locale(), { day: 'numeric', month: 'long' });

function statusText(st: CalibrationStatus): string {
  if (st.kind === 'done') return t('Откалибровано: вниз {0}°, вверх {1}°{2}', { 0: st.down, 1: st.up, 2: st.at ? ` · ${dateText(st.at)}` : '' });
  if (st.kind === 'skipped') return t('Пропущено: считаю по общим порогам');
  return t('Не откалибровано: спрошу перед первым подходом');
}

/** Личные пороги счёта по каждому упражнению: статус и своя кнопка «Пройти заново». Планку калибровать не нужно. */
function RecalibrateRow() {
  const saved = useCalibration();
  const [again, setAgain] = useState<RepExercise | null>(null);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="toggle-row calib-row">
      <div className="calib-list">
        <div>
          <div className="toggle-title">{t('Калибровка камеры')}</div>
          <div className="muted">{t('3 медленных повтора, и счёт подстроится под твою амплитуду. Если повторы теряются, пройди заново только это упражнение.')}</div>
        </div>
        {REP_EXERCISES.map((e) => (
          <div key={e} className="calib-ex">
            <div>
              <div className="calib-ex-name">{EXERCISE_LABELS[e]}</div>
              <div className="muted">{statusText(calibrationStatus(e, saved))}</div>
            </div>
            <button className="small-btn ghost" onClick={() => setAgain(e)}>
              {t('Пройти заново')}
            </button>
          </div>
        ))}
        {confirm ? (
          <div className="danger-row">
            <span>{t('Сбросить калибровку всех упражнений?')}</span>
            <button
              className="small-btn danger"
              onClick={() => {
                resetCalibration();
                setConfirm(false);
              }}
            >
              {t('Сбросить')}
            </button>
            <button className="small-btn ghost" onClick={() => setConfirm(false)}>
              {t('Отмена')}
            </button>
          </div>
        ) : (
          <button className="link danger-link calib-all" disabled={!Object.keys(saved).length} onClick={() => setConfirm(true)}>
            {t('Сбросить все')}
          </button>
        )}
      </div>
      {again && <RecalibrateScreen exercise={again} onClose={() => setAgain(null)} />}
    </div>
  );
}

/** Id в Telegram: по нему вручную выдаётся Pro Pass (файл .pro-ids на сервере). */
function TelegramIdRow() {
  const id = tg?.initDataUnsafe.user?.id;
  const [copied, setCopied] = useState(false);
  if (!id) return null;
  return (
    <div className="settings-note tg-id-row">
      <span>
        {t('Твой ID в Telegram:')} <b>{id}</b>
      </span>
      <button
        className="small-btn ghost"
        onClick={() =>
          navigator.clipboard
            ?.writeText(String(id))
            .then(() => setCopied(true))
            .catch(() => null)
        }
      >
        {copied ? t('Скопировано') : t('Копировать')}
      </button>
    </div>
  );
}

/** Переключатель сообщений бота: о рейде клана или письма Мастера Грома. */
function NotifyRow({ field, set, title, text }: { field: 'raidNotify' | 'letters'; set: (on: boolean) => Promise<boolean>; title: string; text: string }) {
  const [cloud, setCloud] = useState(cloudState);
  const [on, setOn] = useState(cloud?.[field] ?? true);
  useEffect(
    () =>
      onCloud((c) => {
        setCloud(c);
        setOn(c[field]);
      }),
    [],
  );
  const [busy, setBusy] = useState(false);
  const change = (v: boolean) => {
    setOn(v);
    setBusy(true);
    set(v)
      .then(setOn)
      .catch(() => setOn(cloud?.[field] ?? true))
      .finally(() => setBusy(false));
  };
  return (
    <label className="toggle-row">
      <div>
        <div className="toggle-title">{title}</div>
        <div className="muted">{text}</div>
      </div>
      <input type="checkbox" className="switch" checked={on} disabled={busy || !cloud?.bot || (field === 'raidNotify' && !cloud.telegram)} onChange={(e) => change(e.target.checked)} />
    </label>
  );
}

/** Напоминание от бота, если к этому часу ещё не было тренировки. */
function RemindRow() {
  const [cloud, setCloud] = useState(cloudState);
  const [hour, setHour] = useState<number | null>(cloud?.remind?.hour ?? null);
  useEffect(
    () =>
      onCloud((c) => {
        setCloud(c);
        setHour(c.remind?.hour ?? null);
      }),
    [],
  );
  const [busy, setBusy] = useState(false);
  const change = (h: number | null) => {
    setHour(h);
    setBusy(true);
    setRemind(h)
      .then((r) => setHour(r?.hour ?? null))
      .catch(() => setHour(cloud?.remind?.hour ?? null))
      .finally(() => setBusy(false));
  };
  return (
    <div className="toggle-row remind-row">
      <div>
        <div className="toggle-title">{t('Напоминание в боте')}</div>
        <div className="muted">
          {!cloud
            ? t('Подключаюсь к серверу…')
            : !cloud.bot
              ? t('Пока недоступно: сервер не может сам писать в мессенджер. Заработает, когда подключим пересылку.')
              : !cloud.telegram
                ? t('Работает, когда приложение открыто из Telegram или Max.')
                : t('Мастер Гром напишет в бота, если к этому часу не было тренировки, и напомнит задание дня.')}
        </div>
        {hour != null && (
          <select className="remind-hour" value={hour} disabled={busy} onChange={(e) => change(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {t('в {0}:00', { 0: String(h).padStart(2, '0') })}
              </option>
            ))}
          </select>
        )}
      </div>
      <input type="checkbox" className="switch" checked={hour != null} disabled={busy || !cloud?.bot || !cloud.telegram} onChange={(e) => change(e.target.checked ? 19 : null)} />
    </div>
  );
}
