import { useEffect, useState } from 'react';
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

const TOGGLES: { key: { [K in keyof Settings]-?: Settings[K] extends boolean ? K : never }[keyof Settings]; title: string; text: string }[] = [
  { key: 'sound', title: 'Звуки', text: 'Сигнал на каждый повтор, удары, победа и монеты. Слышно темп, не глядя на экран.' },
  { key: 'music', title: 'Музыка', text: 'Тихая фоновая мелодия: своя в каждом мире, барабаны на арене.' },
  { key: 'voice', title: 'Голос тренера', text: 'Мастер Гром вслух считает повторы, подсказывает время и технику. Нужен русский голос в телефоне.' },
  { key: 'haptics', title: 'Вибрация', text: 'Телефон коротко вибрирует на повтор.' },
  { key: 'guide', title: 'Подсказка перед уровнем', text: '3D-схема, как поставить телефон.' },
  { key: 'story', title: 'Диалоги сюжета', text: 'Разговоры с героями перед уровнями. Без них сразу к тренировке.' },
  { key: 'skeleton', title: 'Скелет на видео', text: 'Линии позы поверх камеры: видно, что приложение тебя распознаёт.' },
  { key: 'dayNight', title: 'День и ночь в деревне', text: 'Деревня живёт по твоим часам: золотой вечер, ночью горят фонари. Без этого всегда светлый день.' },
  { key: 'villageFx', title: 'Погода и эффекты деревни', text: 'Дождь и снег, светлячки, пыль от разрушений, летящие монеты и салют. Выключи, если телефон греется.' },
  { key: 'flyIn', title: 'Пролёт над деревней', text: 'Камера плавно облетает деревню, когда ты в неё заходишь.' },
  { key: 'lowPower', title: 'Экономный режим', text: 'Без теней и сглаживания, 3D попроще и в меньшем разрешении. Помогает, если телефон слабый или греется. На слабых телефонах включается сам.' },
];

/** Настройки: звуки, музыка, вибрация, подсказки, батарея, сброс прогресса. */
export function SettingsSheet({ progress, onReset, onIntro, onClose }: { progress: Progress; onReset: () => void; onIntro: () => void; onClose: () => void }) {
  const s = useSettings();
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet onClose={onClose}>
      <div className="level-title">Настройки</div>
      {TOGGLES.map((t) => (
        <label key={t.key} className="toggle-row">
          <div>
            <div className="toggle-title">{t.title}</div>
            <div className="muted">{t.text}</div>
          </div>
          <input type="checkbox" className="switch" checked={s[t.key]} onChange={(e) => setSetting(t.key, e.target.checked)} />
        </label>
      ))}
      <RecalibrateRow />
      <RemindRow />
      <RaidNotifyRow />
      <BlackListRow />
      <button className="secondary" onClick={onIntro}>
        Посмотреть знакомство заново
      </button>
      <div className="settings-note">
        <b>Камера и приватность.</b> Видео обрабатывается прямо на телефоне и никуда не отправляется. На сервер уходят только результаты и прогресс.{' '}
        <PrivacyLink />
      </div>
      <div className="settings-note">
        <b>Прогресс</b> сохраняется на сервере и вернётся на новом телефоне: герой {heroLevel(heroXp(progress)).level} уровня, {Object.keys(progress.stars).length} пройденных уровней.
      </div>
      <WebLoginRow />
      <AccountRow />
      <TelegramIdRow />
      <AdminStatsRow />
      <AdminChargeRow />
      {confirm ? (
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
      )}
      <DeleteDataRow />
      {/* Лицензия банка звуков требует указать авторов. */}
      <small className="muted credits">Модели — KayKit (Kay Lousberg, CC0). Инструменты в музыке — FluidR3 GM (Frank Wen), CC BY 3.0.</small>
    </Sheet>
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
