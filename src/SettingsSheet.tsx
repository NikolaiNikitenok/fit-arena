import { useEffect, useState } from 'react';
import { cloudState, onCloud, setRemind } from './cloud';
import { heroLevel, heroXp, Progress } from './game/progress';
import { setSetting, Settings, useSettings } from './settings';

const TOGGLES: { key: keyof Settings; title: string; text: string }[] = [
  { key: 'sound', title: 'Звуки', text: 'Сигнал на каждый повтор, удары, победа и монеты. Слышно темп, не глядя на экран.' },
  { key: 'music', title: 'Музыка', text: 'Тихая фоновая мелодия: своя в каждом мире, барабаны на арене.' },
  { key: 'haptics', title: 'Вибрация', text: 'Телефон коротко вибрирует на повтор.' },
  { key: 'guide', title: 'Подсказка перед уровнем', text: '3D-схема, как поставить телефон.' },
  { key: 'story', title: 'Диалоги сюжета', text: 'Разговоры с героями перед уровнями. Без них сразу к тренировке.' },
  { key: 'skeleton', title: 'Скелет на видео', text: 'Линии позы поверх камеры: видно, что приложение тебя распознаёт.' },
  { key: 'lowPower', title: 'Экономия батареи', text: 'Без теней и с меньшим разрешением 3D. Помогает, если телефон греется.' },
];

/** Настройки: звуки, музыка, вибрация, подсказки, батарея, сброс прогресса. */
export function SettingsSheet({ progress, onReset, onIntro, onClose }: { progress: Progress; onReset: () => void; onIntro: () => void; onClose: () => void }) {
  const s = useSettings();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
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
        <RemindRow />
        <button className="secondary" onClick={onIntro}>
          Посмотреть знакомство заново
        </button>
        <div className="settings-note">
          <b>Камера и приватность.</b> Видео обрабатывается прямо на телефоне и никуда не отправляется. На сервер уходят только результаты и прогресс.
        </div>
        <div className="settings-note">
          <b>Прогресс</b> сохраняется на сервере и вернётся на новом телефоне: герой {heroLevel(heroXp(progress)).level} уровня, {Object.keys(progress.stars).length} пройденных уровней.
        </div>
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
        <button className="secondary" onClick={onClose}>
          Готово
        </button>
      </div>
    </div>
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
        <div className="toggle-title">Напоминание в Telegram</div>
        <div className="muted">
          {!cloud
            ? 'Подключаюсь к серверу…'
            : !cloud.bot
              ? 'Пока недоступно: сервер не может сам писать в Telegram. Заработает, когда подключим пересылку.'
              : !cloud.telegram
                ? 'Работает, когда приложение открыто из Telegram.'
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
