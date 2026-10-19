import { useState } from 'react';
import { heroLevel, heroXp, Progress } from './game/progress';
import { setSetting, Settings, useSettings } from './settings';

const TOGGLES: { key: keyof Settings; title: string; text: string }[] = [
  { key: 'sound', title: 'Звук повтора', text: 'Короткий сигнал на каждый засчитанный повтор, чтобы не смотреть на экран.' },
  { key: 'haptics', title: 'Вибрация', text: 'Телефон коротко вибрирует на повтор.' },
  { key: 'guide', title: 'Подсказка перед уровнем', text: '3D-схема, как поставить телефон.' },
  { key: 'story', title: 'Диалоги сюжета', text: 'Разговоры с героями перед уровнями. Без них сразу к тренировке.' },
  { key: 'skeleton', title: 'Скелет на видео', text: 'Линии позы поверх камеры: видно, что приложение тебя распознаёт.' },
  { key: 'lowPower', title: 'Экономия батареи', text: 'Без теней и с меньшим разрешением 3D. Помогает, если телефон греется.' },
];

/** Настройки: звук, вибрация, подсказки, батарея, сброс прогресса. */
export function SettingsSheet({ progress, onReset, onClose }: { progress: Progress; onReset: () => void; onClose: () => void }) {
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
        <div className="settings-note">
          <b>Камера и приватность.</b> Видео обрабатывается прямо на телефоне и никуда не отправляется. На сервер уходят только результаты дуэлей.
        </div>
        <div className="settings-note">
          <b>Прогресс</b> хранится на этом устройстве: герой {heroLevel(heroXp(progress)).level} уровня, {Object.keys(progress.stars).length} пройденных уровней.
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
