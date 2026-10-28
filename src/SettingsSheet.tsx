import { type ReactNode, useEffect, useState } from 'react';
import { calibrationStatus, CalibrationStatus, resetCalibration, useCalibration } from './calibration';
import { RecalibrateScreen } from './RecalibrateScreen';
import { cloudState, onCloud, setRaidNotify, setRemind } from './cloud';
import { heroLevel, heroXp, Progress } from './game/progress';
import { EXERCISE_LABELS, REP_EXERCISES, RepExercise } from './repCounter';
import { setSetting, Settings, useSettings } from './settings';
import { tg } from './telegram';
import { AdminChargeRow, AdminStatsRow, DeleteDataRow, PrivacyLink } from './SettingsExtra';
import { BlackListRow } from './moderation/BlackList';
import { Sheet } from './Sheet';
import { AccountRow } from './account/Account';
import { WebLoginRow } from './account/WebLogin';
import { ChangesList } from './updates/UpdateBanner';
import { CHANGELOG } from './updates/changelog';
import { APP_VERSION } from './telemetry';
import { Bell, Camera, ChevronLeft, Info, Sparkles, Speaker, UserCircle, Wrench } from './icons';

type ToggleKey = { [K in keyof Settings]-?: Settings[K] extends boolean ? K : never }[keyof Settings];
const TOGGLES: Record<string, { key: ToggleKey; title: string; text: string }> = {
  sound: { key: 'sound', title: 'Звуки', text: 'Сигнал на каждый повтор, удары, победа и монеты. Слышно темп, не глядя на экран.' },
  music: { key: 'music', title: 'Музыка', text: 'Тихая фоновая мелодия: своя в каждом мире, барабаны на арене.' },
  voice: { key: 'voice', title: 'Голос тренера', text: 'Мастер Гром вслух считает повторы, подсказывает время и технику. Нужен русский голос в телефоне.' },
  haptics: { key: 'haptics', title: 'Вибрация', text: 'Телефон коротко вибрирует на повтор.' },
  guide: { key: 'guide', title: 'Подсказка перед уровнем', text: '3D-схема, как поставить телефон.' },
  story: { key: 'story', title: 'Диалоги сюжета', text: 'Разговоры с героями перед уровнями. Без них сразу к тренировке.' },
  skeleton: { key: 'skeleton', title: 'Скелет на видео', text: 'Линии позы поверх камеры: видно, что приложение тебя распознаёт.' },
  dayNight: { key: 'dayNight', title: 'День и ночь в деревне', text: 'Деревня живёт по твоим часам: золотой вечер, ночью горят фонари. Без этого всегда светлый день.' },
  villageFx: { key: 'villageFx', title: 'Погода и эффекты деревни', text: 'Дождь и снег, светлячки, пыль от разрушений, летящие монеты и салют. Выключи, если телефон греется.' },
  flyIn: { key: 'flyIn', title: 'Пролёт над деревней', text: 'Камера плавно облетает деревню, когда ты в неё заходишь.' },
  homeList: { key: 'homeList', title: 'Главная списком', text: 'Все разделы друг под другом, с прокруткой — как раньше. Без этого герой во весь экран, а кнопки по бокам.' },
  lowPower: { key: 'lowPower', title: 'Экономный режим', text: 'Без теней и сглаживания, 3D попроще и в меньшем разрешении. Помогает, если телефон слабый или греется. На слабых телефонах включается сам.' },
};

function Toggles({ keys }: { keys: ToggleKey[] }) {
  const s = useSettings();
  return (
    <>
      {keys.map((k) => {
        const t = TOGGLES[k];
        return (
          <label key={k} className="toggle-row">
            <div>
              <div className="toggle-title">{t.title}</div>
              <div className="muted">{t.text}</div>
            </div>
            <input type="checkbox" className="switch" checked={s[k]} onChange={(e) => setSetting(k, e.target.checked)} />
          </label>
        );
      })}
    </>
  );
}

type Section = 'sound' | 'training' | 'graphics' | 'notify' | 'account' | 'about' | 'admin';
type Tone = 'accent' | 'mint' | 'violet' | 'gold' | 'blue' | 'grey' | 'rose';

const SOUND: ToggleKey[] = ['sound', 'music', 'voice', 'haptics'];
const TRAINING: ToggleKey[] = ['guide', 'story', 'skeleton'];
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
      <Sheet onClose={back} bodyClassName="settings-sub">
        <SubHead title={SECTION_TITLES[section]} onBack={back} />
        {section === 'sound' && <Toggles keys={SOUND} />}
        {section === 'training' && (
          <>
            <Toggles keys={TRAINING} />
            <RecalibrateRow />
            <div className="settings-note">
              <b>Камера и приватность.</b> Видео обрабатывается прямо на телефоне и никуда не отправляется. На сервер уходят только результаты и прогресс.
            </div>
          </>
        )}
        {section === 'graphics' && <Toggles keys={GRAPHICS} />}
        {section === 'notify' && (
          <>
            <RemindRow />
            <RaidNotifyRow />
          </>
        )}
        {section === 'account' && (
          <>
            <div className="settings-note">
              <b>Прогресс</b> сохраняется на сервере и вернётся на новом телефоне: герой {heroLevel(heroXp(progress)).level} уровня, {Object.keys(progress.stars).length} пройденных уровней.
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
    { id: 'sound', tone: 'accent', icon: <Speaker />, sub: 'Звуки, музыка, голос тренера' },
    { id: 'training', tone: 'mint', icon: <Camera />, sub: 'Подсказки, скелет, калибровка' },
    { id: 'graphics', tone: 'violet', icon: <Sparkles />, sub: s.lowPower ? 'Включён экономный режим' : 'Погода, день и ночь, эффекты' },
    { id: 'notify', tone: 'gold', icon: <Bell />, sub: 'Напоминания и рейды клана' },
    { id: 'account', tone: 'blue', icon: <UserCircle />, sub: 'Вход, прогресс, чёрный список' },
    { id: 'about', tone: 'grey', icon: <Info />, sub: 'Обновления и приватность' },
  ];
  if (admin) rows.push({ id: 'admin', tone: 'rose', icon: <Wrench />, sub: 'Статистика, FPS, заряд подземелья' });

  return (
    <Sheet onClose={onClose}>
      <div className="level-title">Настройки</div>
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
  sound: 'Звук и вибрация',
  training: 'Камера и тренировки',
  graphics: 'Графика',
  notify: 'Уведомления',
  account: 'Аккаунт и данные',
  about: 'Об игре',
  admin: 'Админ',
};

/** Заголовок раздела со стрелкой назад к списку. */
function SubHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="settings-sub-head">
      <button className="settings-back" onClick={onBack} aria-label="К настройкам">
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
      <span>Стереть героя, предметы и монеты?</span>
      <button
        className="small-btn danger"
        onClick={() => {
          onReset();
          onClose();
        }}
      >
        Стереть
      </button>
      <button className="small-btn ghost" onClick={() => setConfirm(false)}>
        Отмена
      </button>
    </div>
  ) : (
    <button className="link danger-link" onClick={() => setConfirm(true)}>
      Начать игру заново
    </button>
  );
}

/** «Об игре»: знакомство, история обновлений, приватность, авторы. */
function AboutSection({ onIntro }: { onIntro: () => void }) {
  const [history, setHistory] = useState(false);
  return (
    <>
      <button className="secondary" onClick={onIntro}>
        Посмотреть знакомство заново
      </button>
      <button className="secondary" onClick={() => setHistory((v) => !v)}>
        {history ? 'Скрыть историю обновлений' : 'История обновлений'}
      </button>
      {history && <ChangesList entries={CHANGELOG} />}
      <div className="settings-note">
        <b>Камера и приватность.</b> Видео обрабатывается прямо на телефоне и никуда не отправляется. На сервер уходят только результаты и прогресс. <PrivacyLink />
      </div>
      {/* Лицензия банка звуков требует указать авторов. */}
      <small className="muted credits">
        Версия {APP_VERSION}. Модели — KayKit (Kay Lousberg, CC0). Инструменты в музыке — FluidR3 GM (Frank Wen), CC BY 3.0.
      </small>
    </>
  );
}

const dateText = (at: number) => new Date(at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

function statusText(st: CalibrationStatus): string {
  if (st.kind === 'done') return `Откалибровано: вниз ${st.down}°, вверх ${st.up}°${st.at ? ` · ${dateText(st.at)}` : ''}`;
  if (st.kind === 'skipped') return 'Пропущено: считаю по общим порогам';
  return 'Не откалибровано: спрошу перед первым подходом';
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
          <div className="toggle-title">Калибровка камеры</div>
          <div className="muted">3 медленных повтора, и счёт подстроится под твою амплитуду. Если повторы теряются, пройди заново только это упражнение.</div>
        </div>
        {REP_EXERCISES.map((e) => (
          <div key={e} className="calib-ex">
            <div>
              <div className="calib-ex-name">{EXERCISE_LABELS[e]}</div>
              <div className="muted">{statusText(calibrationStatus(e, saved))}</div>
            </div>
            <button className="small-btn ghost" onClick={() => setAgain(e)}>
              Пройти заново
            </button>
          </div>
        ))}
        {confirm ? (
          <div className="danger-row">
            <span>Сбросить калибровку всех упражнений?</span>
            <button
              className="small-btn danger"
              onClick={() => {
                resetCalibration();
                setConfirm(false);
              }}
            >
              Сбросить
            </button>
            <button className="small-btn ghost" onClick={() => setConfirm(false)}>
              Отмена
            </button>
          </div>
        ) : (
          <button className="link danger-link calib-all" disabled={!Object.keys(saved).length} onClick={() => setConfirm(true)}>
            Сбросить все
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
        Твой ID в Telegram: <b>{id}</b>
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
        {copied ? 'Скопировано' : 'Копировать'}
      </button>
    </div>
  );
}

/** Сообщения бота о рейде клана: босс проснулся, осталось несколько часов, итог. */
function RaidNotifyRow() {
  const [cloud, setCloud] = useState(cloudState);
  const [on, setOn] = useState(cloud?.raidNotify ?? true);
  useEffect(
    () =>
      onCloud((c) => {
        setCloud(c);
        setOn(c.raidNotify);
      }),
    [],
  );
  const [busy, setBusy] = useState(false);
  const change = (v: boolean) => {
    setOn(v);
    setBusy(true);
    setRaidNotify(v)
      .then(setOn)
      .catch(() => setOn(cloud?.raidNotify ?? true))
      .finally(() => setBusy(false));
  };
  return (
    <label className="toggle-row">
      <div>
        <div className="toggle-title">Уведомления о рейде</div>
        <div className="muted">Бот напишет в субботу, когда босс клана проснётся, напомнит в воскресенье вечером о несделанных атаках и пришлёт итог рейда.</div>
      </div>
      <input type="checkbox" className="switch" checked={on} disabled={busy || !cloud?.bot || !cloud.telegram} onChange={(e) => change(e.target.checked)} />
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
        <div className="toggle-title">Напоминание в боте</div>
        <div className="muted">
          {!cloud
            ? 'Подключаюсь к серверу…'
            : !cloud.bot
              ? 'Пока недоступно: сервер не может сам писать в мессенджер. Заработает, когда подключим пересылку.'
              : !cloud.telegram
                ? 'Работает, когда приложение открыто из Telegram или Max.'
                : 'Мастер Гром напишет в бота, если к этому часу не было тренировки, и напомнит задание дня.'}
        </div>
        {hour != null && (
          <select className="remind-hour" value={hour} disabled={busy} onChange={(e) => change(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                в {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        )}
      </div>
      <input type="checkbox" className="switch" checked={hour != null} disabled={busy || !cloud?.bot || !cloud.telegram} onChange={(e) => change(e.target.checked ? 19 : null)} />
    </div>
  );
}
